/**
 * Swell adapter for the ecommerce vertical.
 *
 * Maps the Swell Backend API (https://api.swell.store, HTTP Basic
 * storeId:secretKey; see constants.ts) to the canonical ecommerce resources:
 *  - Products    → GET /products
 *  - Variants    → GET /products:variants
 *  - Categories  → GET /categories      (→ Collection)
 *  - Accounts    → GET /accounts        (→ Customer)
 *  - Orders      → GET /orders
 *  - Shipments   → GET /shipments       (→ Fulfillment)
 *  - Refunds     → GET /payments:refunds
 *  - Payments    → GET /payments        (→ Transaction)
 *  - Coupons     → GET /coupons         (→ Discount)
 *
 * Every list endpoint takes "limit" ("Limit the number of records returned,
 * ranging between 1 and 1000. Defaults to 15.") and "page" ("The page number
 * of results to return given the specified or default limit."), 1-based
 * ("Defaults to 1."), and answers with "count (total matching records),
 * results, page, limit, page_count" (https://developers.swell.is/backend-api/querying).
 * Filters go in `where` with MongoDB operators ("$gte Matches values that are
 * greater than or equal to a specified value."), serialised as
 * `where[field][$op]=value`.
 *
 * Docs: https://developers.swell.is/backend-api/introduction
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: location — Swell has no listable location REST resource; shipping
 *   locations live in dashboard settings (/settings/shipping/locations) and are
 *   not exposed as a queryable API collection.
 * Unavailable: inventory — GET /products:stock lists stock adjustments, not
 *   levels; see listInventoryLevels.
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import { customForm, reportUpstreamPage } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { InventoryLevel } from '../../schema/inventory'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Refund } from '../../schema/refund'
import type { Transaction } from '../../schema/transaction'
import type { Discount } from '../../schema/discount'

import { buildAuthUrl, exchangeCode as swellExchangeCode } from './auth'
import { SwellClient, type SwellListResponse } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import {
  transformProduct,
  untransformProduct,
  transformProductVariant,
  untransformProductVariant,
  type RawSwellProduct,
  type RawSwellVariant,
} from './transform/product'
import {
  transformCollection,
  untransformCollection,
  type RawSwellCategory,
} from './transform/collection'
import { transformCustomer, untransformCustomer, type RawSwellAccount } from './transform/customer'
import { transformOrder, untransformOrder, type RawSwellOrder } from './transform/order'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawSwellShipment,
} from './transform/fulfillment'
import { transformRefund, untransformRefund, type RawSwellRefund } from './transform/refund'
import {
  transformTransaction,
  untransformTransaction,
  type RawSwellPayment,
} from './transform/transaction'
import { transformDiscount, untransformDiscount, type RawSwellCoupon } from './transform/discount'

export interface SwellAdapterConfig {
  /** Swell store ID (HTTP Basic username). */
  storeId?: string
  /** Swell secret key (HTTP Basic password). */
  secretKey?: string
}

/**
 * https://developers.swell.is/backend-api/authentication: "authenticate with
 * basic auth using your store ID as the username and a secret key as the
 * password". Both are needed, so the form asks for both.
 */
const CREDENTIAL_FORM = customForm({
  fields: [
    {
      name: 'storeId',
      label: 'Store ID',
      type: 'text',
      helpText:
        'Swell dashboard → Developer → API keys: "Your store ID is located at the top of the API keys page."',
      required: true,
    },
    {
      name: 'secretKey',
      label: 'Secret key',
      type: 'password',
      helpText: 'Swell dashboard → Developer → API keys → Secret key.',
      required: true,
    },
  ],
  exchange: async (input) => {
    const storeId = (input?.['storeId'] ?? '').trim()
    const secretKey = (input?.['secretKey'] ?? '').trim()
    if (!storeId) throw new Error('Store ID is required.')
    if (!secretKey) throw new Error('Secret key is required.')
    return { accessToken: secretKey, extra: { storeId } }
  },
})

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

export class SwellAdapter implements EcommerceAdapter {
  // Connect Link support — store ID + secret key.
  credentialFields = CREDENTIAL_FORM.credentialFields

  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  readonly platform = 'swell'
  readonly version = '0.2.0'
  /** `search` is a documented list argument ("A text search is performed
   *  using the search argument."); `limit` ranges "between 1 and 1000". */
  readonly capabilities = { search: true, maxPageSize: MAX_PAGE_SIZE }

  private configStoreId: string | undefined
  private configSecretKey: string | undefined

  constructor(config: SwellAdapterConfig = {}) {
    this.configStoreId = config.storeId
    this.configSecretKey = config.secretKey
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return buildAuthUrl()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return swellExchangeCode()
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): SwellClient {
    const secretKey = credentials.accessToken || this.configSecretKey
    const storeId = (credentials.extra?.['storeId'] as string | undefined) ?? this.configStoreId

    if (!secretKey || !storeId) {
      throw new Error(
        'Swell adapter is missing storeId/secretKey — ' +
          'either configure them in apps/integration-server/config/config.yml under adapters.swell, ' +
          'or POST them to /v1/connections with credentials: {storeId, secretKey}.',
      )
    }
    return new SwellClient(storeId, secretKey)
  }

  /** The documented filters shared by every list: `updatedAfter` and `search`. */
  private filters(
    params: QueryParams,
    where: Record<string, unknown> = {},
  ): Record<string, unknown> {
    const w: Record<string, unknown> = { ...where }
    if (params.updatedAfter) {
      // Every model documents `date_updated` ("Date and time the … was last updated.").
      w['date_updated'] = { $gte: params.updatedAfter.toISOString() }
    }
    const out: Record<string, unknown> = {}
    if (Object.keys(w).length > 0) out['where'] = w
    if (params.search) out['search'] = params.search
    return out
  }

  /**
   * One caller page of a Swell list: the caller's 1-based `page` and its
   * `limit` (clamped to the documented 1000) sent as they are, and the end
   * read from the documented `count` of matching records.
   */
  private async listPage<R, T>(
    credentials: Credentials,
    params: QueryParams,
    path: string,
    query: Record<string, unknown>,
    map: (raw: R) => T,
  ): Promise<T[]> {
    const asked = params.limit ?? DEFAULT_PAGE_SIZE
    const limit = Math.max(1, Math.min(Math.floor(asked), MAX_PAGE_SIZE))
    const page =
      typeof params.page === 'number' && Number.isFinite(params.page) && params.page >= 1
        ? Math.floor(params.page)
        : 1

    const res = await this.clientFor(credentials).get<SwellListResponse<R>>(path, {
      ...query,
      limit,
      page,
    })
    if (!Array.isArray(res?.results)) {
      throw new Error(`Swell GET ${path} returned no results array`)
    }
    const rows = res.results
    if (typeof res.count === 'number') {
      reportUpstreamPage(params, {
        totalCount: res.count,
        hasMore: (page - 1) * limit + rows.length < res.count,
        ...(limit < asked ? { pageSize: limit } : {}),
      })
    }
    return rows.map(map)
  }

  // ── Products ──────────────────────────────────────────────────────────────

  /** GET /products — https://developers.swell.is/backend-api/products */
  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    return this.listPage<RawSwellProduct, Product>(
      credentials,
      params,
      '/products',
      this.filters(params),
      transformProduct,
    )
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.clientFor(credentials).get<RawSwellProduct>(
      `/products/${encodeURIComponent(id)}`,
    )
    return transformProduct(res)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const client = this.clientFor(credentials)
    const res = await client.post<RawSwellProduct>('/products', untransformProduct(data))
    return transformProduct(res)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const client = this.clientFor(credentials)
    const res = await client.put<RawSwellProduct>(`/products/${id}`, untransformProduct(data))
    return transformProduct(res)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`/products/${id}`)
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  /**
   * GET /products:variants — https://developers.swell.is/backend-api/variants
   * ("Return a list of product variants."), optionally narrowed to one
   * product with where[parent_id] ("ID of the parent product."). Each variant
   * is expanded with its `parent` ("Expandable link to the parent product.")
   * because a variant's price "Overrides parent product price".
   */
  async listVariants(credentials: Credentials, params: QueryParams): Promise<ProductVariant[]> {
    const productId = (params['productId'] ?? params['product_id']) as string | undefined
    return this.listPage<RawSwellVariant, ProductVariant>(
      credentials,
      params,
      '/products:variants',
      { ...this.filters(params, productId ? { parent_id: productId } : {}), expand: 'parent' },
      transformProductVariant,
    )
  }

  /** GET /products:variants/:id — "Retrieve a variant". */
  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    const res = await this.clientFor(credentials).get<RawSwellVariant>(
      `/products:variants/${encodeURIComponent(id)}`,
      { expand: 'parent' },
    )
    return transformProductVariant(res)
  }

  async createVariant(
    credentials: Credentials,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const productId = data.productId
    if (!productId) throw new Error('createVariant requires productId')
    const client = this.clientFor(credentials)
    const res = await client.post<RawSwellVariant>(
      `/products/${productId}/variants`,
      untransformProductVariant(data),
    )
    return transformProductVariant(res)
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const productId = data.productId
    if (!productId) throw new Error('updateVariant requires productId in data')
    const client = this.clientFor(credentials)
    const res = await client.put<RawSwellVariant>(
      `/products/${productId}/variants/${id}`,
      untransformProductVariant(data),
    )
    return transformProductVariant(res)
  }

  async deleteVariant(credentials: Credentials, id: string): Promise<void> {
    const client = this.clientFor(credentials)
    await client.delete(`/products:variants/${id}`)
  }

  // ── Collections (Categories) ──────────────────────────────────────────────

  /** GET /categories — https://developers.swell.is/backend-api/categories */
  async listCollections(credentials: Credentials, params: QueryParams): Promise<Collection[]> {
    return this.listPage<RawSwellCategory, Collection>(
      credentials,
      params,
      '/categories',
      this.filters(params),
      transformCollection,
    )
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const res = await this.clientFor(credentials).get<RawSwellCategory>(
      `/categories/${encodeURIComponent(id)}`,
    )
    return transformCollection(res)
  }

  async createCollection(credentials: Credentials, data: Partial<Collection>): Promise<Collection> {
    const client = this.clientFor(credentials)
    const res = await client.post<RawSwellCategory>('/categories', untransformCollection(data))
    return transformCollection(res)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const client = this.clientFor(credentials)
    const res = await client.put<RawSwellCategory>(`/categories/${id}`, untransformCollection(data))
    return transformCollection(res)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`/categories/${id}`)
  }

  // ── Customers (Accounts) ──────────────────────────────────────────────────

  /** GET /accounts — https://developers.swell.is/backend-api/accounts */
  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    return this.listPage<RawSwellAccount, Customer>(
      credentials,
      params,
      '/accounts',
      this.filters(params),
      transformCustomer,
    )
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.clientFor(credentials).get<RawSwellAccount>(
      `/accounts/${encodeURIComponent(id)}`,
    )
    return transformCustomer(res)
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const client = this.clientFor(credentials)
    const res = await client.post<RawSwellAccount>('/accounts', untransformCustomer(data))
    return transformCustomer(res)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const client = this.clientFor(credentials)
    const res = await client.put<RawSwellAccount>(`/accounts/${id}`, untransformCustomer(data))
    return transformCustomer(res)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`/accounts/${id}`)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  /** GET /orders — https://developers.swell.is/backend-api/orders */
  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    return this.listPage<RawSwellOrder, Order>(
      credentials,
      params,
      '/orders',
      this.filters(params),
      transformOrder,
    )
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const res = await this.clientFor(credentials).get<RawSwellOrder>(
      `/orders/${encodeURIComponent(id)}`,
    )
    return transformOrder(res)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = this.clientFor(credentials)
    const res = await client.post<RawSwellOrder>('/orders', untransformOrder(data))
    return transformOrder(res)
  }

  async updateOrder(credentials: Credentials, id: string, data: Partial<Order>): Promise<Order> {
    const client = this.clientFor(credentials)
    const res = await client.put<RawSwellOrder>(`/orders/${id}`, untransformOrder(data))
    return transformOrder(res)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Order> {
    const client = this.clientFor(credentials)
    const res = await client.put<RawSwellOrder>(`/orders/${id}`, {
      canceled: true,
      cancel_reason: data?.reason,
    })
    return transformOrder(res)
  }

  // ── Fulfillments (Shipments) ──────────────────────────────────────────────

  /**
   * GET /shipments — https://developers.swell.is/backend-api/shipments
   * ("Return a list of shipments."), optionally narrowed to one order with
   * where[order_id] ("The id of the order this shipment was created for.").
   */
  async listFulfillments(credentials: Credentials, params: QueryParams): Promise<Fulfillment[]> {
    const orderId = (params['order_id'] ?? params['orderId']) as string | undefined
    return this.listPage<RawSwellShipment, Fulfillment>(
      credentials,
      params,
      '/shipments',
      this.filters(params, orderId ? { order_id: orderId } : {}),
      transformFulfillment,
    )
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const res = await this.clientFor(credentials).get<RawSwellShipment>(
      `/shipments/${encodeURIComponent(id)}`,
    )
    return transformFulfillment(res)
  }

  async createFulfillment(
    credentials: Credentials,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    if (!data.orderId) throw new Error('createFulfillment requires orderId')
    const client = this.clientFor(credentials)
    const body = { ...untransformFulfillment(data), order_id: data.orderId }
    const res = await client.post<RawSwellShipment>('/shipments', body)
    return transformFulfillment(res)
  }

  async updateFulfillment(
    credentials: Credentials,
    id: string,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    const client = this.clientFor(credentials)
    const res = await client.put<RawSwellShipment>(`/shipments/${id}`, untransformFulfillment(data))
    return transformFulfillment(res)
  }

  async cancelFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const client = this.clientFor(credentials)
    const res = await client.put<RawSwellShipment>(`/shipments/${id}`, { canceled: true })
    return transformFulfillment(res)
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  /**
   * GET /payments:refunds — https://developers.swell.is/backend-api/refunds
   * ("Return a list of refunds."). Narrowed to one order with where[order_id]
   * when asked; otherwise to refunds that have an order at all
   * (`$exists`: "Matches records that have a specified field defined."),
   * since a canonical refund needs its order.
   *
   * Also narrowed to where[status]=success. The refund model's status "Can be
   * pending, which is awaiting async processing, error, or success"
   * (enum: pending void error success), and the canonical Refund has no status
   * field, so a failed, voided or not-yet-processed refund would otherwise be
   * served as money returned. Equality filters are documented on the querying
   * page: "?active=true is equivalent to where[active]=true".
   */
  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const orderId = (params['order_id'] ?? params['orderId']) as string | undefined
    return this.listPage<RawSwellRefund, Refund>(
      credentials,
      params,
      '/payments:refunds',
      this.filters(params, { order_id: orderId ?? { $exists: true }, status: 'success' }),
      (r) => transformRefund(r, orderId),
    )
  }

  /** GET /payments:refunds/:id — "Retrieve a refund". */
  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const res = await this.clientFor(credentials).get<RawSwellRefund>(
      `/payments:refunds/${encodeURIComponent(id)}`,
    )
    return transformRefund(res)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.orderId) throw new Error('createRefund requires orderId')
    const client = this.clientFor(credentials)
    const body = { ...untransformRefund(data), order_id: data.orderId }
    const res = await client.post<RawSwellRefund>(`/orders/${data.orderId}/refunds`, body)
    return transformRefund(res, data.orderId)
  }

  // ── Transactions (Payments) ───────────────────────────────────────────────

  /** GET /payments — https://developers.swell.is/backend-api/payments */
  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    return this.listPage<RawSwellPayment, Transaction>(
      credentials,
      params,
      '/payments',
      this.filters(params),
      transformTransaction,
    )
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const res = await this.clientFor(credentials).get<RawSwellPayment>(
      `/payments/${encodeURIComponent(id)}`,
    )
    return transformTransaction(res)
  }

  async createTransaction(
    credentials: Credentials,
    data: Partial<Transaction>,
  ): Promise<Transaction> {
    const client = this.clientFor(credentials)
    const res = await client.post<RawSwellPayment>('/payments', untransformTransaction(data))
    return transformTransaction(res)
  }

  // ── Discounts (Coupons) ───────────────────────────────────────────────────

  /** GET /coupons — https://developers.swell.is/backend-api/coupons */
  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    return this.listPage<RawSwellCoupon, Discount>(
      credentials,
      params,
      '/coupons',
      this.filters(params),
      transformDiscount,
    )
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const res = await this.clientFor(credentials).get<RawSwellCoupon>(
      `/coupons/${encodeURIComponent(id)}`,
    )
    return transformDiscount(res)
  }

  async createDiscount(credentials: Credentials, data: Partial<Discount>): Promise<Discount> {
    const client = this.clientFor(credentials)
    const res = await client.post<RawSwellCoupon>('/coupons', untransformDiscount(data))
    return transformDiscount(res)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const client = this.clientFor(credentials)
    const res = await client.put<RawSwellCoupon>(`/coupons/${id}`, untransformDiscount(data))
    return transformDiscount(res)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(`/coupons/${id}`)
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  /**
   * Refused. The only stock collection, GET /products:stock
   * (https://developers.swell.is/backend-api/stock), is "a list of product
   * stock adjustments": a ledger whose `level` is the "New stock level after
   * the adjustment is applied", with many rows per variant. Current levels
   * live on variants (`stock_level`, "Current in-stock quantity of the
   * variant"). The variant model also has `stock_locations` ("object — Stock
   * distributed over inventory locations, if multi-location inventory is
   * enabled.") and `stock_level_in_locations` ("Total stock level of the
   * variant across inventory locations."), but the keys and values of
   * `stock_locations` are undocumented, and the canonical InventoryLevel
   * requires a locationId. Reading it would mean guessing its shape.
   */
  async listInventoryLevels(
    _credentials: Credentials,
    _params: QueryParams,
  ): Promise<InventoryLevel[]> {
    throw notSupported(
      'Swell cannot list inventory levels: GET /products:stock returns "a list of product stock ' +
        'adjustments" whose level is the "New stock level after the adjustment is applied", ' +
        'and the per-location stock on variants, stock_locations ("Stock distributed over ' +
        'inventory locations"), is an object whose shape is undocumented, so no location id ' +
        'can be read for an inventory level.',
    )
  }

  async getInventoryLevel(_credentials: Credentials, _id: string): Promise<InventoryLevel> {
    throw notSupported(
      'Swell cannot read an inventory level: GET /products:stock/:id returns one stock ' +
        'adjustment, not a level.',
    )
  }
}
