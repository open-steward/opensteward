/**
 * Yo!Kart adapter for the ecommerce vertical.
 *
 * Yo!Kart is a self-hosted multi-vendor marketplace platform. The "App API"
 * (`/app-api/{version}/`) is the REST interface used by the mobile client and
 * available for third-party integrations. Authentication uses an API key
 * generated in the Yo!Kart admin panel (Admin → Third Party API) which is
 * passed as the `api_key` query parameter on every request.
 *
 * Because the store is self-hosted, every connection carries the store's
 * domain in `credentials.extra.site`.
 *
 * Yo!Kart supports:
 *   Products (read)
 *   Collections / Categories (read)
 *   Customers / Buyers (read + write via admin API)
 *   Orders (read + cancel via admin API)
 *   Refunds (read + create via admin API)
 *   Discounts / Promo Codes (CRUD via admin API)
 *   Inventory (read via seller-product stock field; set via admin API)
 *   Locations (synthetic single-store default)
 *
 * Yo!Kart does NOT have a public webhook system in the documented API, so
 * `verifyWebhook` / `parseWebhookEvents` are not implemented.
 *
 * Docs: https://www.yo-kart.com/resource-center.html (API Document V2.3)
 */

import { customForm } from '@opensteward/shared'
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

import { buildAuthUrl, exchangeCode as yokartExchangeCode } from './auth'
import { YokartClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import {
  transformProduct,
  transformVariant,
  type RawYokartProduct,
} from './transform/product'
import {
  transformCollection,
  untransformCollection,
  type RawYokartCategory,
} from './transform/collection'
import {
  transformCustomer,
  untransformCustomer,
  type RawYokartCustomer,
} from './transform/customer'
import {
  transformOrder,
  untransformOrder,
  type RawYokartOrder,
} from './transform/order'
import {
  transformRefund,
  untransformRefund,
  type RawYokartRefund,
} from './transform/refund'
import {
  transformDiscount,
  untransformDiscount,
  type RawYokartPromoCode,
} from './transform/discount'
import { syntheticDefaultLocation } from './transform/location'
import {
  transformInventoryLevel,
  type RawYokartSellerProductStock,
} from './transform/inventory'
import {
  transformFulfillment,
  type RawYokartShipment,
} from './transform/fulfillment'
import {
  transformTransaction,
  type RawYokartTransaction,
} from './transform/transaction'

// ── Connect Link credential form ──────────────────────────────────────────────

/**
 * Yo!Kart requires two pieces of information per connection:
 *   1. The store URL (e.g. https://shop.example.com)
 *   2. The API key from Admin → Third Party API
 *
 * We collect both via a custom form so the Connect Link flow works.
 */
const YOKART_FORM = customForm({
  fields: [
    {
      name: 'site',
      label: 'Store URL',
      type: 'text',
      placeholder: 'https://shop.example.com',
      helpText: 'The full URL of your Yo!Kart store (no trailing slash).',
      required: true,
    },
    {
      name: 'apiKey',
      label: 'API key',
      type: 'password',
      helpText: 'Found in Yo!Kart admin panel → Third Party API.',
      required: true,
    },
  ],
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const site = (fields['site'] ?? '').replace(/\/$/, '').trim()
    const apiKey = (fields['apiKey'] ?? '').trim()
    if (!site) throw new Error('Store URL is required.')
    if (!apiKey) throw new Error('API key is required.')
    return { accessToken: apiKey, extra: { site } }
  },
})

// ── Adapter config ────────────────────────────────────────────────────────────

export interface YokartAdapterConfig {
  /** Yo!Kart store URL, e.g. `https://shop.example.com`. */
  site?: string
  /** API key from Admin → Third Party API. */
  apiKey?: string
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class YokartAdapter implements EcommerceAdapter {
  readonly platform = 'yokart'
  readonly version = '0.1.0'
  /** Honours `params.search`; see AdapterCapabilities. Declared so the
   *  router can refuse the parameter on adapters that would drop it. */
  readonly capabilities = { search: true }

  // Connect Link support.
  credentialFields = YOKART_FORM.credentialFields
  exchangeCredentials = YOKART_FORM.exchangeCredentials

  private configSite: string | undefined
  private configApiKey: string | undefined

  constructor(config: YokartAdapterConfig = {}) {
    this.configSite = config.site
    this.configApiKey = config.apiKey
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return buildAuthUrl(this.configSite ?? 'https://your-yokart-store.example')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return yokartExchangeCode()
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Yo!Kart API keys do not expire.
    return credentials
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): YokartClient {
    const apiKey =
      (credentials.accessToken && credentials.accessToken !== 'api-key'
        ? credentials.accessToken
        : undefined) ?? this.configApiKey
    const site =
      (credentials.extra?.['site'] as string | undefined) ?? this.configSite

    if (!apiKey || !site) {
      throw new Error(
        'Yo!Kart adapter is missing apiKey or site. ' +
          'Either configure them under adapters.yokart in config.yml, ' +
          'or POST them to /v1/connections with ' +
          '`{ credentials: { accessToken: "<api_key>", extra: { site: "https://shop.example.com" } } }`.',
      )
    }

    const mergedCreds: Credentials = {
      ...credentials,
      accessToken: apiKey,
      extra: { ...credentials.extra, site },
    }
    return new YokartClient(mergedCreds)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      pageSize: params.limit ?? DEFAULT_PAGE_SIZE,
      page: params.page ?? 1,
    }
    if (params.search) out['keyword'] = params.search
    return out
  }

  private siteFor(credentials: Credentials): string {
    return (
      (credentials.extra?.['site'] as string | undefined) ??
      this.configSite ??
      'default'
    )
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.clientFor(credentials).listWithPage<RawYokartProduct>(
      'products/search',
      'products',
      this.listParams(params),
    )
    return res.items.map((p) => transformProduct(p))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    // Yo!Kart product detail is under /products/view/{id}
    const data = await this.clientFor(credentials).get<Record<string, unknown>>(
      `products/view/${id}`,
    )
    // The detail response wraps the product in a `productData` key or returns
    // it at the data root — normalise both shapes.
    const raw: RawYokartProduct =
      ((data['productData'] ?? data['product'] ?? data) as RawYokartProduct)
    return transformProduct(raw)
  }

  // ── Variants ─────────────────────────────────────────────────────────────

  async listVariants(credentials: Credentials, params: QueryParams): Promise<ProductVariant[]> {
    const productId = (params['productId'] ?? params['product_id']) as string | undefined
    if (!productId) {
      throw new Error(
        'Yo!Kart requires ?product_id= for listVariants; ' +
          'variants (seller-products) are nested under their parent product.',
      )
    }
    const data = await this.clientFor(credentials).get<Record<string, unknown>>(
      `products/view/${productId}`,
    )
    const raw = (data['productData'] ?? data['product'] ?? data) as RawYokartProduct
    // For multi-variant products, selprod_id from the detail page is the
    // primary variant; return it wrapped as a single-item list.
    return [transformVariant(raw, productId)]
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    // id is the selprod_id. We load the product detail to hydrate the variant.
    // Callers may pass `productId:selprodId` composite or just selprodId.
    const parts = id.split(':')
    const selprodId = parts.length > 1 ? parts[1]! : id
    const productId = parts.length > 1 ? parts[0]! : id

    const data = await this.clientFor(credentials).get<Record<string, unknown>>(
      `products/view/${productId}`,
    )
    const raw = (data['productData'] ?? data['product'] ?? data) as RawYokartProduct
    const variant = transformVariant(raw, productId)
    return { ...variant, id: selprodId }
  }

  // ── Collections ───────────────────────────────────────────────────────────

  async listCollections(credentials: Credentials, params: QueryParams): Promise<Collection[]> {
    const res = await this.clientFor(credentials).listWithPage<RawYokartCategory>(
      'categories/listing',
      'categories',
      this.listParams(params),
    )
    return res.items.map((c) => transformCollection(c))
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const data = await this.clientFor(credentials).get<Record<string, unknown>>(
      `categories/view/${id}`,
    )
    const raw = (data['category'] ?? data) as RawYokartCategory
    return transformCollection(raw)
  }

  async createCollection(
    credentials: Credentials,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const body = untransformCollection(data)
    const res = await this.clientFor(credentials).post<Record<string, unknown>>(
      'admin/categories/add',
      body,
    )
    const raw = (res['category'] ?? res) as RawYokartCategory
    return transformCollection(raw)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const body = untransformCollection(data)
    const res = await this.clientFor(credentials).post<Record<string, unknown>>(
      `admin/categories/edit/${id}`,
      body,
    )
    const raw = (res['category'] ?? res) as RawYokartCategory
    return transformCollection(raw)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).post(`admin/categories/delete/${id}`)
  }

  // ── Locations ─────────────────────────────────────────────────────────────

  async listLocations(
    credentials: Credentials,
    _params: QueryParams,
  ): Promise<Location[]> {
    return [syntheticDefaultLocation(this.siteFor(credentials))]
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    if (id !== 'default') {
      throw new Error(
        `Yo!Kart has no native multi-location inventory; unknown location id '${id}'`,
      )
    }
    return syntheticDefaultLocation(this.siteFor(credentials))
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    // Yo!Kart exposes stock on seller-product objects. Listing requires
    // a product id to scope the request.
    const productId = (params['productId'] ?? params['product_id']) as
      | string
      | undefined
    if (!productId) {
      throw new Error(
        'listInventoryLevels for Yo!Kart requires ?product_id= (the parent product id)',
      )
    }
    const data = await this.clientFor(credentials).get<Record<string, unknown>>(
      `products/view/${productId}`,
    )
    const raw = (data['productData'] ?? data['product'] ?? data) as RawYokartProduct
    if (!raw.selprod_id) return []
    const stock: RawYokartSellerProductStock = {
      selprod_id: raw.selprod_id,
      selprod_stock: raw.selprod_stock,
    }
    return [transformInventoryLevel(stock)]
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    // Update the seller-product stock via the admin API.
    const res = await this.clientFor(credentials).post<RawYokartSellerProductStock>(
      `admin/seller-products/update-stock/${data.variantId}`,
      { selprod_stock: data.available },
    )
    return transformInventoryLevel(res)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const res = await this.clientFor(credentials).listWithPage<RawYokartCustomer>(
      'admin/users/listing',
      'users',
      this.listParams(params),
    )
    return res.items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const data = await this.clientFor(credentials).get<Record<string, unknown>>(
      `admin/users/view/${id}`,
    )
    const raw = (data['user'] ?? data) as RawYokartCustomer
    return transformCustomer(raw)
  }

  async createCustomer(
    credentials: Credentials,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const body = untransformCustomer(data)
    const res = await this.clientFor(credentials).post<Record<string, unknown>>(
      'admin/users/add',
      body,
    )
    const raw = (res['user'] ?? res) as RawYokartCustomer
    return transformCustomer(raw)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const body = untransformCustomer(data)
    const res = await this.clientFor(credentials).post<Record<string, unknown>>(
      `admin/users/edit/${id}`,
      body,
    )
    const raw = (res['user'] ?? res) as RawYokartCustomer
    return transformCustomer(raw)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const res = await this.clientFor(credentials).listWithPage<RawYokartOrder>(
      'admin/orders/listing',
      'orders',
      this.listParams(params),
    )
    return res.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const data = await this.clientFor(credentials).get<Record<string, unknown>>(
      `admin/orders/view/${id}`,
    )
    const raw = (data['order'] ?? data) as RawYokartOrder
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const body = untransformOrder(data)
    const res = await this.clientFor(credentials).post<Record<string, unknown>>(
      'admin/orders/add',
      body,
    )
    const raw = (res['order'] ?? res) as RawYokartOrder
    return transformOrder(raw)
  }

  async updateOrder(
    credentials: Credentials,
    id: string,
    data: Partial<Order>,
  ): Promise<Order> {
    const body = untransformOrder(data)
    const res = await this.clientFor(credentials).post<Record<string, unknown>>(
      `admin/orders/edit/${id}`,
      body,
    )
    const raw = (res['order'] ?? res) as RawYokartOrder
    return transformOrder(raw)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Order> {
    const res = await this.clientFor(credentials).post<Record<string, unknown>>(
      `admin/orders/cancel/${id}`,
    )
    const raw = (res['order'] ?? res) as RawYokartOrder
    return transformOrder(raw)
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const orderId = (params['order_id'] ?? params['orderId']) as string | undefined
    if (!orderId) {
      throw new Error('listRefunds requires `order_id` in query params')
    }
    const res = await this.clientFor(credentials).listWithPage<RawYokartRefund>(
      `admin/orders/refunds/${orderId}`,
      'refunds',
      this.listParams(params),
    )
    return res.items.map((r) => transformRefund(r, orderId))
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const [orderId, refundId] = id.split(':')
    if (!orderId || !refundId) {
      throw new Error('Invalid refund id format: expected `orderId:refundId`')
    }
    const data = await this.clientFor(credentials).get<Record<string, unknown>>(
      `admin/refunds/view/${refundId}`,
    )
    const raw = (data['refund'] ?? data) as RawYokartRefund
    return transformRefund(raw, orderId)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.orderId) throw new Error('createRefund requires orderId')
    const body = untransformRefund(data)
    const res = await this.clientFor(credentials).post<Record<string, unknown>>(
      'admin/refunds/add',
      body,
    )
    const raw = (res['refund'] ?? res) as RawYokartRefund
    return transformRefund(raw, data.orderId)
  }

  // ── Fulfillments ──────────────────────────────────────────────────────────

  async listFulfillments(credentials: Credentials, params: QueryParams): Promise<Fulfillment[]> {
    const orderId = (params['order_id'] ?? params['orderId']) as string | undefined
    if (!orderId) {
      throw new Error('listFulfillments requires `order_id` in query params')
    }
    const res = await this.clientFor(credentials).listWithPage<RawYokartShipment>(
      `admin/orders/shipments/${orderId}`,
      'shipments',
      this.listParams(params),
    )
    return res.items.map((s) => transformFulfillment(s, orderId))
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const [orderId, shipmentId] = id.split(':')
    const lookupId = shipmentId ?? id
    const data = await this.clientFor(credentials).get<Record<string, unknown>>(
      `admin/shipments/view/${lookupId}`,
    )
    const raw = (data['shipment'] ?? data) as RawYokartShipment
    return transformFulfillment(raw, orderId)
  }

  // ── Transactions ──────────────────────────────────────────────────────────

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const orderId = (params['order_id'] ?? params['orderId']) as string | undefined
    if (!orderId) {
      throw new Error('listTransactions requires `order_id` in query params')
    }
    const res = await this.clientFor(credentials).listWithPage<RawYokartTransaction>(
      `admin/orders/transactions/${orderId}`,
      'transactions',
      this.listParams(params),
    )
    return res.items.map((t) => transformTransaction(t, orderId))
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const [orderId, txId] = id.split(':')
    const lookupId = txId ?? id
    const data = await this.clientFor(credentials).get<Record<string, unknown>>(
      `admin/transactions/view/${lookupId}`,
    )
    const raw = (data['transaction'] ?? data) as RawYokartTransaction
    return transformTransaction(raw, orderId)
  }

  // ── Discounts ─────────────────────────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const res = await this.clientFor(credentials).listWithPage<RawYokartPromoCode>(
      'admin/promocodes/listing',
      'promocodes',
      this.listParams(params),
    )
    return res.items.map(transformDiscount)
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const data = await this.clientFor(credentials).get<Record<string, unknown>>(
      `admin/promocodes/view/${id}`,
    )
    const raw = (data['promocode'] ?? data) as RawYokartPromoCode
    return transformDiscount(raw)
  }

  async createDiscount(
    credentials: Credentials,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const body = untransformDiscount(data)
    const res = await this.clientFor(credentials).post<Record<string, unknown>>(
      'admin/promocodes/add',
      body,
    )
    const raw = (res['promocode'] ?? res) as RawYokartPromoCode
    return transformDiscount(raw)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const body = untransformDiscount(data)
    const res = await this.clientFor(credentials).post<Record<string, unknown>>(
      `admin/promocodes/edit/${id}`,
      body,
    )
    const raw = (res['promocode'] ?? res) as RawYokartPromoCode
    return transformDiscount(raw)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).post(`admin/promocodes/delete/${id}`)
  }
}
