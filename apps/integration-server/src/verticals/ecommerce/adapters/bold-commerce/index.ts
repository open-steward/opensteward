/**
 * Bold Commerce adapter for the ecommerce vertical.
 *
 * Reads go to Bold's public APIs on https://api.boldcommerce.com with
 * `Authorization: Bearer {access_token}`
 * (https://developer.boldcommerce.com/guides/checkout/public-integrations):
 *
 *  - products, variants, categories (as collections): Products API
 *    (https://developer.boldcommerce.com/api/products)
 *  - customers: Customers API (https://developer.boldcommerce.com/api/customers)
 *  - discounts: Price Rules rulesets (https://developer.boldcommerce.com/api/price-rules)
 *  - locations: Checkout Admin warehouses + zones
 *    (https://developer.boldcommerce.com/api/checkout-admin)
 *
 * Every path is scoped by the shop's `shop_identifier`, stored on the
 * connection as `extra.shopIdentifier` at connect time (see ./auth.ts).
 *
 * Bold documents no list or read of orders, fulfillments, refunds,
 * transactions or inventory levels: the Checkout Backend API
 * (https://developer.boldcommerce.com/api/orders) "is used to initialize an
 * order through authenticated requests" and has no GET operation. Those reads
 * refuse with 501 before sending anything.
 *
 * The write methods below still carry the paths of the Shopify adapter this
 * one was copied from; they are out of scope for the read rebuild and do not
 * exist at Bold.
 */

import { pageLocally, reportUpstreamPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Location } from '../../schema/location'
import type { InventoryLevel } from '../../schema/inventory'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Refund } from '../../schema/refund'
import type { Transaction } from '../../schema/transaction'
import type { Discount } from '../../schema/discount'
import type { WebhookEvent } from '../../schema/webhook'

import { buildAuthUrl, exchangeCode as boldExchangeCode } from './auth'
import { BoldCommerceClient, type BoldPagination } from './client'
import { DEFAULT_SCOPES, MAX_PAGE_SIZE } from './constants'
import { verifyShopifyWebhook, parseShopifyWebhookEvents } from './webhook'

import {
  transformBoldProduct,
  transformBoldVariant,
  type RawBoldDeepProduct,
  type RawBoldVariant,
} from './transform/catalog'
import { transformCategory, type RawBoldCategory } from './transform/category'
import { transformBoldCustomer, type RawBoldCustomer } from './transform/v2-customer'
import { transformWarehouse, type RawBoldWarehouse, type RawBoldZone } from './transform/warehouse'
import { transformRuleset, type RawBoldRuleset } from './transform/ruleset'

import {
  transformProduct,
  untransformProduct,
  transformVariant,
  untransformVariant,
  type RawShopifyProduct,
  type RawShopifyVariant,
} from './transform/product'
import {
  transformCollection,
  untransformCollection,
  type RawShopifyCollection,
} from './transform/collection'
import { transformInventoryLevel, type RawShopifyInventoryLevel } from './transform/inventory'
import {
  transformCustomer,
  untransformCustomer,
  type RawShopifyCustomer,
} from './transform/customer'
import { transformOrder, untransformOrder, type RawShopifyOrder } from './transform/order'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawShopifyFulfillment,
} from './transform/fulfillment'
import { transformRefund, untransformRefund, type RawShopifyRefund } from './transform/refund'
import {
  transformTransaction,
  untransformTransaction,
  type RawShopifyTransaction,
} from './transform/transaction'
import {
  transformDiscount,
  untransformDiscount,
  type RawShopifyPriceRule,
  type RawShopifyDiscountCode,
} from './transform/discount'

export interface BoldCommerceAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

/** The error the router and sync worker treat as "this platform cannot do that". */
function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404, code: 'NOT_FOUND' })
}

/**
 * The Checkout Backend API, the only Bold API that handles orders, "is used
 * to initialize an order through authenticated requests"; its operations are
 * Initialize, Resume, Create and Cancel Order plus payment, refund and
 * line-item writes, none of them a GET.
 */
const NO_ORDER_READS =
  'the Checkout Backend API "is used to initialize an order through authenticated requests" and documents no GET operation for orders, fulfillments, refunds or transactions'

/** Page-number paging shared by every Bold list endpoint this adapter pages. */
interface PageRequest {
  page: number
  limit: number
}

export class BoldCommerceAdapter implements EcommerceAdapter {
  readonly platform = 'bold-commerce'
  readonly version = '0.2.0'
  /** "`limit` — Limits the number of results per-page. Maximum 100." */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: BoldCommerceAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return boldExchangeCode(code, this.clientId, this.clientSecret)
  }

  /**
   * "Once generated, API access tokens do not expire, and refresh tokens are
   * not required." Credentials carry no `expiresAt`, so there is nothing to
   * refresh.
   */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyShopifyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    const topic =
      (payload['__topic'] as string | undefined) ?? (payload['topic'] as string | undefined)
    return parseShopifyWebhookEvents(payload, topic)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): BoldCommerceClient {
    return new BoldCommerceClient(credentials)
  }

  /**
   * The `shop_identifier` every Bold path carries ("The shop identifier
   * retrieved from the Get Shop Info endpoint."), stored at connect time.
   */
  private shop(credentials: Credentials): string {
    const id = credentials.extra?.['shopIdentifier']
    if (typeof id !== 'string' || id === '') {
      throw notSupported(
        'Bold Commerce needs the shop_identifier from Get Shop Info on the connection (extra.shopIdentifier); reconnect to store it',
      )
    }
    return encodeURIComponent(id)
  }

  /**
   * The shop's ISO-4217 currency from Get Shop Info, stored at connect time:
   * the only documented currency for Bold variant prices.
   */
  private currency(credentials: Credentials): string {
    const currency = credentials.extra?.['currency']
    if (typeof currency !== 'string' || currency === '') {
      throw new Error(
        'Bold Commerce connection has no shop currency (extra.currency from Get Shop Info); reconnect to store it',
      )
    }
    return currency
  }

  /**
   * The caller's 1-based page and limit, the limit clamped to Bold's maximum
   * of 100. A clamped size is reported so the router judges the page at it.
   */
  private pageRequest(params: QueryParams): PageRequest {
    const asked =
      typeof params.limit === 'number' && params.limit >= 1 ? params.limit : MAX_PAGE_SIZE
    const limit = Math.min(asked, MAX_PAGE_SIZE)
    if (typeof params.limit === 'number' && limit < params.limit) {
      reportUpstreamPage(params, { pageSize: limit })
    }
    const page = typeof params.page === 'number' && params.page >= 1 ? params.page : 1
    return { page, limit }
  }

  /** Report Bold's `pagination` block: `total`, `total_pages`, `current_page`. */
  private reportPagination(params: QueryParams, pagination: BoldPagination | undefined): void {
    if (!pagination) return
    const { total, total_pages: totalPages, current_page: currentPage } = pagination
    reportUpstreamPage(params, {
      ...(typeof total === 'number' ? { totalCount: total } : {}),
      ...(typeof totalPages === 'number' ? { totalPages } : {}),
      ...(typeof currentPage === 'number' ? { currentPage } : {}),
      ...(typeof totalPages === 'number' && typeof currentPage === 'number'
        ? { hasMore: currentPage < totalPages }
        : {}),
    })
  }

  // ── Products ──────────────────────────────────────────────────────────────

  /**
   * GET /products/v2/shops/{shop_identifier}/products — "Lists all products in
   * the shop." with `limit`, `page`, `deep` and `updated_at_min`.
   */
  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const shop = this.shop(credentials)
    const { page, limit } = this.pageRequest(params)
    const query: Record<string, unknown> = { page, limit, deep: true }
    if (params.updatedAfter) query.updated_at_min = params.updatedAfter.toISOString()
    const res = await this.client(credentials).get<{
      data?: RawBoldDeepProduct[]
      pagination?: BoldPagination
    }>(`/products/v2/shops/${shop}/products`, query)
    this.reportPagination(params, res?.pagination)
    const rows = res?.data ?? []
    if (rows.length === 0) return []
    const currency = this.currency(credentials)
    return rows.map((p) => transformBoldProduct(p, currency))
  }

  /** GET /products/v2/shops/{shop_identifier}/products/{id} — "Get Product by ID". */
  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const shop = this.shop(credentials)
    const res = await this.client(credentials).get<{ data: RawBoldDeepProduct }>(
      `/products/v2/shops/${shop}/products/${encodeURIComponent(id)}`,
      { deep: true },
    )
    return transformBoldProduct(res.data, this.currency(credentials))
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const res = await this.client(credentials).post<{ product: RawShopifyProduct }>(
      'products.json',
      { product: untransformProduct(data) },
    )
    return transformProduct(res.product)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const res = await this.client(credentials).put<{ product: RawShopifyProduct }>(
      `products/${id}.json`,
      { product: { id, ...untransformProduct(data) } },
    )
    return transformProduct(res.product)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`products/${id}.json`)
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  /**
   * GET /products/v2/shops/{shop_identifier}/variants — "Lists all product
   * variants in the shop." with `filter`, `limit` and `page`.
   */
  async listVariants(credentials: Credentials, params: QueryParams): Promise<ProductVariant[]> {
    const shop = this.shop(credentials)
    const { page, limit } = this.pageRequest(params)
    const res = await this.client(credentials).get<{
      data?: RawBoldVariant[]
      pagination?: BoldPagination
    }>(`/products/v2/shops/${shop}/variants`, { page, limit })
    this.reportPagination(params, res?.pagination)
    const rows = res?.data ?? []
    if (rows.length === 0) return []
    const currency = this.currency(credentials)
    return rows.map((v) => transformBoldVariant(v, currency))
  }

  /**
   * The variant ids `listVariants` returns are Bold variant ids with no Bold
   * product id beside them (`v2Variant` carries only `platform_product_id`),
   * so the per-product Get Product Variant by ID cannot be addressed. The shop
   * variants list takes `filter` in the Query & Pagination syntax
   * (`eq(column:val)`, "perform column=value operation") on its `id` column.
   */
  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    const shop = this.shop(credentials)
    // v2Variant.id is `type: integer, format: int64`; anything else cannot
    // name a variant and must not be spliced into the filter expression.
    if (!/^\d+$/.test(id)) throw notFound(`Bold Commerce variant ${id} not found`)
    const res = await this.client(credentials).get<{ data?: RawBoldVariant[] }>(
      `/products/v2/shops/${shop}/variants`,
      { filter: `eq(id:${id})` },
    )
    const row = (res?.data ?? []).find((v) => String(v.id) === id)
    if (!row) throw notFound(`Bold Commerce variant ${id} not found`)
    return transformBoldVariant(row, this.currency(credentials))
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const res = await this.client(credentials).put<{ variant: RawShopifyVariant }>(
      `variants/${id}.json`,
      { variant: { id, ...untransformVariant(data) } },
    )
    return transformVariant(res.variant)
  }

  // ── Collections (Bold categories) ─────────────────────────────────────────

  /**
   * GET /products/v2/shops/{shop_identifier}/categories — "Lists product
   * categories for the shop." with `limit`, `page` and `ids`. Bold has no
   * collections resource; categories are its product grouping.
   */
  async listCollections(credentials: Credentials, params: QueryParams): Promise<Collection[]> {
    const shop = this.shop(credentials)
    const { page, limit } = this.pageRequest(params)
    const res = await this.client(credentials).get<{
      data?: RawBoldCategory[]
      pagination?: BoldPagination
    }>(`/products/v2/shops/${shop}/categories`, { page, limit })
    this.reportPagination(params, res?.pagination)
    return (res?.data ?? []).map(transformCategory)
  }

  /** GET /products/v2/shops/{shop_identifier}/categories/{id} — "Get Category by ID". */
  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const shop = this.shop(credentials)
    const res = await this.client(credentials).get<{ data: RawBoldCategory }>(
      `/products/v2/shops/${shop}/categories/${encodeURIComponent(id)}`,
    )
    return transformCategory(res.data)
  }

  async createCollection(credentials: Credentials, data: Partial<Collection>): Promise<Collection> {
    // Only manual (custom) collections are creatable via the REST API.
    const res = await this.client(credentials).post<{
      custom_collection: RawShopifyCollection
    }>('custom_collections.json', { custom_collection: untransformCollection(data) })
    return transformCollection(res.custom_collection, 'MANUAL')
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const res = await this.client(credentials).put<{
      custom_collection: RawShopifyCollection
    }>(`custom_collections/${id}.json`, {
      custom_collection: { id, ...untransformCollection(data) },
    })
    return transformCollection(res.custom_collection, 'MANUAL')
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`custom_collections/${id}.json`)
  }

  // ── Locations (Bold Checkout warehouses) ──────────────────────────────────

  /**
   * GET /checkout/shop/{shop_identifier}/zones/warehouses ("Lists all
   * warehouses for a given shop.") joined to GET
   * /checkout/shop/{shop_identifier}/zones ("Lists all zones for a shop.") for
   * each warehouse's name. Neither takes paging parameters, so both return
   * every row and the caller's page is cut locally.
   */
  private async warehouses(credentials: Credentials): Promise<Location[]> {
    const shop = this.shop(credentials)
    const client = this.client(credentials)
    const [warehouseRes, zoneRes] = await Promise.all([
      client.get<{ data?: { warehouses?: RawBoldWarehouse[] } }>(
        `/checkout/shop/${shop}/zones/warehouses`,
      ),
      client.get<{ data?: { zones?: RawBoldZone[] } }>(`/checkout/shop/${shop}/zones`),
    ])
    const warehouses = warehouseRes?.data?.warehouses ?? []
    const zones = new Map((zoneRes?.data?.zones ?? []).map((z) => [z.id, z]))
    return warehouses.map((w) => {
      const zone = zones.get(w.zone_id)
      if (!zone) throw new Error(`Bold warehouse zone ${w.zone_id} is not in the shop's zones`)
      return transformWarehouse(w, zone)
    })
  }

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    return pageLocally(await this.warehouses(credentials), params)
  }

  /** Bold has no get-by-id for a warehouse; it is found in the full list. */
  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const location = (await this.warehouses(credentials)).find((l) => l.id === id)
    if (!location) throw notFound(`Bold Commerce warehouse (zone ${id}) not found`)
    return location
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(
    _credentials: Credentials,
    _params: QueryParams,
  ): Promise<InventoryLevel[]> {
    throw notSupported(
      'Bold Commerce cannot list inventory levels: its APIs document no inventory-level resource; stock appears only as `inventory_quantity` on products and variants ("The current inventory level of the product.")',
    )
  }

  async adjustInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; delta: number },
  ): Promise<InventoryLevel> {
    // `variantId` here is really the inventory_item_id — this matches the
    // transform layer which uses the item id in place of the variant id.
    const res = await this.client(credentials).post<{
      inventory_level: RawShopifyInventoryLevel
    }>('inventory_levels/adjust.json', {
      inventory_item_id: data.variantId,
      location_id: data.locationId,
      available_adjustment: data.delta,
    })
    return transformInventoryLevel(res.inventory_level)
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const res = await this.client(credentials).post<{
      inventory_level: RawShopifyInventoryLevel
    }>('inventory_levels/set.json', {
      inventory_item_id: data.variantId,
      location_id: data.locationId,
      available: data.available,
    })
    return transformInventoryLevel(res.inventory_level)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  /**
   * GET /customers/v2/shops/{shop_identifier}/customers — "Lists the customers
   * that have placed orders on the store." with `limit`, `page` and
   * `updated_at_min`; the rows are under `customers`.
   */
  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const shop = this.shop(credentials)
    const { page, limit } = this.pageRequest(params)
    const query: Record<string, unknown> = { page, limit }
    if (params.updatedAfter) query.updated_at_min = params.updatedAfter.toISOString()
    const res = await this.client(credentials).get<{
      customers?: RawBoldCustomer[]
      pagination?: BoldPagination
    }>(`/customers/v2/shops/${shop}/customers`, query)
    this.reportPagination(params, res?.pagination)
    return (res?.customers ?? []).map(transformBoldCustomer)
  }

  /** GET /customers/v2/shops/{shop_identifier}/customers/{id} — "Get Customer by ID". */
  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const shop = this.shop(credentials)
    const res = await this.client(credentials).get<{ customer: RawBoldCustomer }>(
      `/customers/v2/shops/${shop}/customers/${encodeURIComponent(id)}`,
    )
    return transformBoldCustomer(res.customer)
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const res = await this.client(credentials).post<{ customer: RawShopifyCustomer }>(
      'customers.json',
      { customer: untransformCustomer(data) },
    )
    return transformCustomer(res.customer)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const res = await this.client(credentials).put<{ customer: RawShopifyCustomer }>(
      `customers/${id}.json`,
      { customer: { id, ...untransformCustomer(data) } },
    )
    return transformCustomer(res.customer)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`customers/${id}.json`)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(_credentials: Credentials, _params: QueryParams): Promise<Order[]> {
    throw notSupported(`Bold Commerce cannot list orders: ${NO_ORDER_READS}`)
  }

  async getOrder(_credentials: Credentials, _id: string): Promise<Order> {
    throw notSupported(`Bold Commerce cannot read orders: ${NO_ORDER_READS}`)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const res = await this.client(credentials).post<{ order: RawShopifyOrder }>('orders.json', {
      order: untransformOrder(data),
    })
    return transformOrder(res.order)
  }

  async updateOrder(credentials: Credentials, id: string, data: Partial<Order>): Promise<Order> {
    const res = await this.client(credentials).put<{ order: RawShopifyOrder }>(
      `orders/${id}.json`,
      { order: { id, ...untransformOrder(data) } },
    )
    return transformOrder(res.order)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Order> {
    const res = await this.client(credentials).post<{ order: RawShopifyOrder }>(
      `orders/${id}/cancel.json`,
      { reason: data?.reason },
    )
    return transformOrder(res.order)
  }

  // ── Fulfillments ──────────────────────────────────────────────────────────

  async listFulfillments(_credentials: Credentials, _params: QueryParams): Promise<Fulfillment[]> {
    throw notSupported(`Bold Commerce cannot list fulfillments: ${NO_ORDER_READS}`)
  }

  async getFulfillment(_credentials: Credentials, _id: string): Promise<Fulfillment> {
    throw notSupported(`Bold Commerce cannot read fulfillments: ${NO_ORDER_READS}`)
  }

  async createFulfillment(
    credentials: Credentials,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    if (!data.orderId) throw new Error('createFulfillment requires orderId')
    const res = await this.client(credentials).post<{ fulfillment: RawShopifyFulfillment }>(
      'fulfillments.json',
      {
        fulfillment: {
          ...untransformFulfillment(data),
          line_items_by_fulfillment_order: [
            // The caller should provide platform-specific details in metadata
            // for nontrivial cases; this is a minimal default.
          ],
        },
      },
    )
    return transformFulfillment(res.fulfillment)
  }

  async updateFulfillment(
    credentials: Credentials,
    id: string,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    const res = await this.client(credentials).post<{ fulfillment: RawShopifyFulfillment }>(
      `fulfillments/${id}/update_tracking.json`,
      {
        fulfillment: {
          notify_customer: data.notifyCustomer,
          tracking_info: {
            number: data.trackingNumber,
            url: data.trackingUrl,
            company: data.carrier,
          },
        },
      },
    )
    return transformFulfillment(res.fulfillment)
  }

  async cancelFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const res = await this.client(credentials).post<{ fulfillment: RawShopifyFulfillment }>(
      `fulfillments/${id}/cancel.json`,
    )
    return transformFulfillment(res.fulfillment)
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  async listRefunds(_credentials: Credentials, _params: QueryParams): Promise<Refund[]> {
    throw notSupported(`Bold Commerce cannot list refunds: ${NO_ORDER_READS}`)
  }

  async getRefund(_credentials: Credentials, _id: string): Promise<Refund> {
    throw notSupported(`Bold Commerce cannot read refunds: ${NO_ORDER_READS}`)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.orderId) throw new Error('createRefund requires orderId')
    const res = await this.client(credentials).post<{ refund: RawShopifyRefund }>(
      `orders/${data.orderId}/refunds.json`,
      { refund: untransformRefund(data) },
    )
    return transformRefund(res.refund)
  }

  // ── Transactions ──────────────────────────────────────────────────────────

  async listTransactions(_credentials: Credentials, _params: QueryParams): Promise<Transaction[]> {
    throw notSupported(`Bold Commerce cannot list transactions: ${NO_ORDER_READS}`)
  }

  async getTransaction(_credentials: Credentials, _id: string): Promise<Transaction> {
    throw notSupported(`Bold Commerce cannot read transactions: ${NO_ORDER_READS}`)
  }

  async createTransaction(
    credentials: Credentials,
    data: Partial<Transaction>,
  ): Promise<Transaction> {
    if (!data.orderId) throw new Error('createTransaction requires orderId')
    const res = await this.client(credentials).post<{
      transaction: RawShopifyTransaction
    }>(`orders/${data.orderId}/transactions.json`, {
      transaction: untransformTransaction(data),
    })
    return transformTransaction(res.transaction)
  }

  // ── Discounts (Bold Price Rules rulesets) ─────────────────────────────────

  /**
   * GET /price_rules/rules/v2/shops/{shop_identifier}/rulesets — "List all
   * rulesets available for the specified shop." with `page`, `limit` and
   * `include_all_apps`: "The standard behaviour for this endpoint is to return
   * just the rulesets that were created using the same auth token. To see all
   * rulesets instead, this parameter should be set to true."
   */
  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const shop = this.shop(credentials)
    const { page, limit } = this.pageRequest(params)
    const res = await this.client(credentials).get<{
      data?: { rulesets?: RawBoldRuleset[] }
      pagination?: BoldPagination
    }>(`/price_rules/rules/v2/shops/${shop}/rulesets`, { page, limit, include_all_apps: true })
    this.reportPagination(params, res?.pagination)
    return (res?.data?.rulesets ?? []).map(transformRuleset)
  }

  /** GET /price_rules/rules/v2/shops/{shop_identifier}/rulesets/{ruleset_id} — "Get Ruleset by ID". */
  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const shop = this.shop(credentials)
    const res = await this.client(credentials).get<{ data: { ruleset: RawBoldRuleset } }>(
      `/price_rules/rules/v2/shops/${shop}/rulesets/${encodeURIComponent(id)}`,
    )
    return transformRuleset(res.data.ruleset)
  }

  async createDiscount(credentials: Credentials, data: Partial<Discount>): Promise<Discount> {
    const client = this.client(credentials)
    const rule = await client.post<{ price_rule: RawShopifyPriceRule }>('price_rules.json', {
      price_rule: untransformDiscount(data),
    })
    let code: RawShopifyDiscountCode | undefined
    if (data.code) {
      const cr = await client.post<{ discount_code: RawShopifyDiscountCode }>(
        `price_rules/${rule.price_rule.id}/discount_codes.json`,
        { discount_code: { code: data.code } },
      )
      code = cr.discount_code
    }
    return transformDiscount(rule.price_rule, code)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const res = await this.client(credentials).put<{ price_rule: RawShopifyPriceRule }>(
      `price_rules/${id}.json`,
      { price_rule: { id, ...untransformDiscount(data) } },
    )
    return transformDiscount(res.price_rule)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`price_rules/${id}.json`)
  }
}
