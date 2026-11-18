/**
 * Cafe24 adapter for the ecommerce vertical.
 *
 * Maps the Cafe24 Admin REST API v2 to the canonical ecommerce resources.
 *
 * Auth: OAuth 2.0 per-mall (access token expires in 2 hours; refresh token
 * valid for 2 weeks; rolling refresh on each use).
 *
 * Base URL: https://{mallId}.cafe24api.com/api/v2/admin
 *
 * Pagination: offset-based (limit + offset; max 100 items per page).
 *
 * Resources supported:
 *   - Products (CRUD)
 *   - Variants (list, get, update)
 *   - Collections / Categories (list, get, create, update, delete)
 *   - Inventory (list per variant, set)
 *   - Customers (list, get from /customersprivacy; create, update)
 *   - Orders (list, get, update, cancel)
 *   - Fulfillments / Shipments (list, get, create, update, cancel)
 *   - Refunds (list over a date range, get, create)
 *   - Transactions (list — synthesised from order payment data)
 *   - Discounts / Coupons (list, get, create, update, delete)
 *   - Locations (shipping origins: list, get)
 *
 * Docs: https://apidocs.cafe24.com/en/docs/guide/intro
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import { isTokenExpired, pageOffset, reportUpstreamPage } from '@opensteward/shared'
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

import { buildAuthUrl, exchangeCode as cafe24ExchangeCode, refreshAccessToken } from './auth'
import { Cafe24Client } from './client'
import { DEFAULT_PAGE_SIZE, DEFAULT_SCOPES, MAX_PAGE_SIZE } from './constants'

import {
  transformProduct,
  untransformProduct,
  transformVariant,
  type RawCafe24Product,
  type RawCafe24Variant,
} from './transform/product'
import {
  transformCollection,
  untransformCollection,
  type RawCafe24Category,
} from './transform/collection'
import { transformLocation, type RawCafe24ShippingOrigin } from './transform/location'
import { transformInventoryLevel, type RawCafe24Inventory } from './transform/inventory'
import {
  transformCustomer,
  untransformCustomer,
  type RawCafe24Customer,
} from './transform/customer'
import { transformOrder, untransformOrder, type RawCafe24Order } from './transform/order'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawCafe24Shipment,
} from './transform/fulfillment'
import {
  transformRefund,
  transformRefundDetail,
  untransformRefund,
  type RawCafe24RefundDetail,
  type RawCafe24RefundRow,
} from './transform/refund'
import { transformTransaction, type RawCafe24Payment } from './transform/transaction'
import { transformCoupon, untransformCoupon, type RawCafe24Coupon } from './transform/discount'

/**
 * A Cafe24 search date: the documented example is `2019-11-01T00:00:00+09:00`
 * (seconds, explicit offset). Sent in UTC.
 */
function cafe24DateTime(d: Date): string {
  return `${d.toISOString().slice(0, 19)}+00:00`
}

// ── Config ────────────────────────────────────────────────────────────────────

export interface Cafe24AdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  /**
   * The Cafe24 mall id (subdomain). Every API and OAuth endpoint is scoped
   * to a specific mall: `https://{mallId}.cafe24api.com/...`
   */
  mallId: string
  scopes?: string[]
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class Cafe24Adapter implements EcommerceAdapter {
  readonly platform = 'cafe24'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private mallId: string
  private scopes: string[]

  constructor(config: Cafe24AdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.mallId = config.mallId
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(
      this.mallId,
      this.clientId,
      this.redirectUri,
      overrideScopes ?? this.scopes,
      state,
    )
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return cafe24ExchangeCode(this.mallId, code, this.clientId, this.clientSecret, this.redirectUri)
  }

  /**
   * Cafe24 access tokens expire after 2 hours. Refresh using the refresh
   * token when the access token has expired (or is about to expire).
   */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!isTokenExpired(credentials.expiresAt)) return credentials
    if (!credentials.refreshToken) return credentials
    return refreshAccessToken(
      this.mallId,
      credentials.refreshToken,
      this.clientId,
      this.clientSecret,
    )
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): Cafe24Client {
    return new Cafe24Client(credentials, this.mallId)
  }

  /**
   * Convert canonical QueryParams to Cafe24 offset-based pagination params.
   * Cafe24 does not support cursor-based pagination.
   */
  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    const offset = params['offset']
    if (typeof offset === 'number') out.offset = offset

    if (params.updatedAfter) {
      out.updated_start_date = params.updatedAfter.toISOString()
    }
    return out
  }

  /**
   * {@link listParams} for a list that pages by the caller's `page`: Cafe24's
   * `limit` is the caller's limit clamped to the 100-row request limit, and
   * `offset` is `(page - 1) × limit` at that clamped size ("offset = (P - 1) * L",
   * apidocs.cafe24.com/en/docs/guide/how-to-use-get-api).
   */
  private pagedListParams(params: QueryParams): { query: Record<string, unknown>; size: number } {
    const asked =
      typeof params.limit === 'number' && Number.isFinite(params.limit) && params.limit >= 1
        ? params.limit
        : DEFAULT_PAGE_SIZE
    const size = Math.min(Math.max(Math.floor(asked), 1), MAX_PAGE_SIZE)
    const query: Record<string, unknown> = {
      ...this.listParams(params),
      limit: size,
      offset: pageOffset(params, size),
    }
    return { query, size }
  }

  /**
   * The list envelope carries no total or next link, so a full page is taken
   * as "more may follow" and a short page as the end.
   */
  private reportOffsetPage(params: QueryParams, returned: number, size: number): void {
    reportUpstreamPage(params, { hasMore: returned >= size, pageSize: size })
  }

  /**
   * Only the documented `limit` and `offset`, for endpoints that document no
   * updated-since filter (unlike {@link pagedListParams}, which also sends
   * `updated_start_date`).
   */
  private offsetPage(params: QueryParams): { query: Record<string, unknown>; size: number } {
    const { size } = this.pagedListParams(params)
    return { query: { limit: size, offset: pageOffset(params, size) }, size }
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const { query, size } = this.pagedListParams(params)
    const res = await this.client(credentials).listPage<RawCafe24Product>('products', 'products', {
      ...query,
      embed: 'variants,options',
    })
    this.reportOffsetPage(params, res.items.length, size)
    return res.items.map((p) => transformProduct(p))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<{ product: RawCafe24Product }>(
      `products/${id}`,
      { embed: 'variants,options' },
    )
    return transformProduct(res.product)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const res = await this.client(credentials).post<{ product: RawCafe24Product }>('products', {
      product: untransformProduct(data),
    })
    return transformProduct(res.product)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const res = await this.client(credentials).put<{ product: RawCafe24Product }>(
      `products/${id}`,
      { product: untransformProduct(data) },
    )
    return transformProduct(res.product)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`products/${id}`)
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  async listVariants(credentials: Credentials, params: QueryParams): Promise<ProductVariant[]> {
    const productId = params['productId'] ?? params['product_id'] ?? params['product_no']
    if (!productId) {
      throw new Error('Cafe24 listVariants requires `productId` in query params')
    }
    const res = await this.client(credentials).listPage<RawCafe24Variant>(
      `products/${String(productId)}/variants`,
      'variants',
      this.listParams(params),
    )
    return res.items.map((v) => transformVariant(v, String(productId)))
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    // Cafe24 variant id is "productNo:variantCode" — split on first colon.
    const colonIdx = id.indexOf(':')
    if (colonIdx === -1) {
      throw new Error('Cafe24 getVariant expects id in `productNo:variantCode` format')
    }
    const productNo = id.slice(0, colonIdx)
    const variantCode = id.slice(colonIdx + 1)
    const res = await this.client(credentials).get<{ variant: RawCafe24Variant }>(
      `products/${productNo}/variants/${variantCode}`,
    )
    return transformVariant(res.variant, productNo)
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const colonIdx = id.indexOf(':')
    if (colonIdx === -1) {
      throw new Error('Cafe24 updateVariant expects id in `productNo:variantCode` format')
    }
    const productNo = id.slice(0, colonIdx)
    const variantCode = id.slice(colonIdx + 1)
    const body: Record<string, unknown> = {}
    if (data.price?.amount != null) body.price = String(data.price.amount)
    const res = await this.client(credentials).put<{ variant: RawCafe24Variant }>(
      `products/${productNo}/variants/${variantCode}`,
      { variant: body },
    )
    return transformVariant(res.variant, productNo)
  }

  // ── Collections / Categories ──────────────────────────────────────────────

  async listCollections(credentials: Credentials, params: QueryParams): Promise<Collection[]> {
    const { query, size } = this.pagedListParams(params)
    const res = await this.client(credentials).listPage<RawCafe24Category>(
      'categories',
      'categories',
      query,
    )
    this.reportOffsetPage(params, res.items.length, size)
    return res.items.map(transformCollection)
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const res = await this.client(credentials).get<{ category: RawCafe24Category }>(
      `categories/${id}`,
    )
    return transformCollection(res.category)
  }

  async createCollection(credentials: Credentials, data: Partial<Collection>): Promise<Collection> {
    const res = await this.client(credentials).post<{ category: RawCafe24Category }>('categories', {
      category: untransformCollection(data),
    })
    return transformCollection(res.category)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const res = await this.client(credentials).put<{ category: RawCafe24Category }>(
      `categories/${id}`,
      { category: untransformCollection(data) },
    )
    return transformCollection(res.category)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`categories/${id}`)
  }

  // ── Locations (shipping origins) ──────────────────────────────────────────

  /**
   * Cafe24 documents no warehouses resource; its stock locations are shipping
   * origins. `GET /shippingorigins` ("Retrieve a list of shipping origins",
   * scope read_shipping) takes `offset` {minimum 0, maximum 8000} and `limit`
   * {minimum 1, maximum 100, default 10}; the envelope is `{ shippingorigins }`.
   */
  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const { query, size } = this.offsetPage(params)
    const res = await this.client(credentials).listPage<RawCafe24ShippingOrigin>(
      'shippingorigins',
      'shippingorigins',
      query,
    )
    this.reportOffsetPage(params, res.items.length, size)
    return res.items.map(transformLocation)
  }

  /** `GET /shippingorigins/{origin_code}` → `{ shippingorigin }`. */
  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const res = await this.client(credentials).get<{ shippingorigin: RawCafe24ShippingOrigin }>(
      `shippingorigins/${encodeURIComponent(id)}`,
    )
    return transformLocation(res.shippingorigin)
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const productId = params['productId'] ?? params['product_no']
    const variantCode = params['variantId'] ?? params['variant_code']
    if (!productId || !variantCode) {
      throw new Error(
        'Cafe24 listInventoryLevels requires `productId` and `variantId` in query params',
      )
    }
    const res = await this.client(credentials).get<{ inventories: RawCafe24Inventory[] }>(
      `products/${String(productId)}/variants/${String(variantCode)}/inventories`,
    )
    return (res.inventories ?? []).map((inv) => transformInventoryLevel(inv, String(variantCode)))
  }

  async getInventoryLevel(credentials: Credentials, id: string): Promise<InventoryLevel> {
    // id format: `variantCode:locationCode` or `productNo:variantCode`
    const [productNo, variantCode] = id.split(':')
    if (!productNo || !variantCode) {
      throw new Error('Cafe24 getInventoryLevel expects id in `productNo:variantCode` format')
    }
    const res = await this.client(credentials).get<{ inventories: RawCafe24Inventory[] }>(
      `products/${productNo}/variants/${variantCode}/inventories`,
    )
    return transformInventoryLevel((res.inventories ?? [])[0] ?? {}, variantCode)
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    // variantId is expected as `productNo:variantCode`
    const colonIdx = data.variantId.indexOf(':')
    if (colonIdx === -1) {
      throw new Error(
        'Cafe24 setInventoryLevel expects variantId in `productNo:variantCode` format',
      )
    }
    const productNo = data.variantId.slice(0, colonIdx)
    const variantCode = data.variantId.slice(colonIdx + 1)
    const res = await this.client(credentials).put<{ inventory: RawCafe24Inventory }>(
      `products/${productNo}/variants/${variantCode}/inventories`,
      { inventory: { quantity: data.available } },
    )
    return transformInventoryLevel(res.inventory ?? {}, variantCode)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  /**
   * `GET /customers` is a lookup ("The member's mobile phone or member ID must
   * be specified as the search criteria"), not a list. The member list is
   * `GET /customersprivacy` ("Retrieve a list of customer information", scope
   * READ_PRIVACY), which takes `limit` {minimum 1, maximum 1000, default 30}
   * and `offset` {minimum 0, maximum 8000}; the envelope is
   * `{ customersprivacy }`. It documents no updated-since filter, so
   * `updatedAfter` is not sent.
   */
  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const { query, size } = this.offsetPage(params)
    const res = await this.client(credentials).listPage<RawCafe24Customer>(
      'customersprivacy',
      'customersprivacy',
      query,
    )
    this.reportOffsetPage(params, res.items.length, size)
    return res.items.map(transformCustomer)
  }

  /** `GET /customersprivacy/{member_id}` → `{ customersprivacy }`. */
  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).get<{ customersprivacy: RawCafe24Customer }>(
      `customersprivacy/${encodeURIComponent(id)}`,
    )
    return transformCustomer(res.customersprivacy)
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const res = await this.client(credentials).post<{ customer: RawCafe24Customer }>('customers', {
      customer: untransformCustomer(data),
    })
    return transformCustomer(res.customer)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const res = await this.client(credentials).put<{ customer: RawCafe24Customer }>(
      `customers/${id}`,
      { customer: untransformCustomer(data) },
    )
    return transformCustomer(res.customer)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const { query, size } = this.pagedListParams(params)
    const res = await this.client(credentials).listPage<RawCafe24Order>('orders', 'orders', query)
    this.reportOffsetPage(params, res.items.length, size)
    return res.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const res = await this.client(credentials).get<{ order: RawCafe24Order }>(`orders/${id}`)
    return transformOrder(res.order)
  }

  async updateOrder(credentials: Credentials, id: string, data: Partial<Order>): Promise<Order> {
    const res = await this.client(credentials).put<{ order: RawCafe24Order }>(`orders/${id}`, {
      order: untransformOrder(data),
    })
    return transformOrder(res.order)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Order> {
    // Cafe24 uses a POST to /orders/{order_id}/cancellation
    await this.client(credentials).post(`orders/${id}/cancellation`, {
      cancellation: { reason: data?.reason ?? '' },
    })
    // Fetch and return the updated order.
    return this.getOrder(credentials, id)
  }

  // ── Fulfillments / Shipments ──────────────────────────────────────────────

  async listFulfillments(credentials: Credentials, params: QueryParams): Promise<Fulfillment[]> {
    const orderId = params['order_id'] ?? params['orderId']
    if (!orderId) {
      throw new Error('Cafe24 listFulfillments requires `order_id` in query params')
    }
    const res = await this.client(credentials).listPage<RawCafe24Shipment>(
      `orders/${String(orderId)}/shipments`,
      'shipments',
      this.listParams(params),
    )
    return res.items.map(transformFulfillment)
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    // id format: `orderId:shipmentCode`
    const colonIdx = id.indexOf(':')
    if (colonIdx === -1) {
      throw new Error('Cafe24 getFulfillment expects id in `orderId:shipmentCode` format')
    }
    const orderId = id.slice(0, colonIdx)
    const shipmentCode = id.slice(colonIdx + 1)
    const res = await this.client(credentials).get<{ shipment: RawCafe24Shipment }>(
      `orders/${orderId}/shipments/${shipmentCode}`,
    )
    return transformFulfillment(res.shipment)
  }

  async createFulfillment(
    credentials: Credentials,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    if (!data.orderId) throw new Error('createFulfillment requires orderId')
    const res = await this.client(credentials).post<{ shipment: RawCafe24Shipment }>(
      `orders/${data.orderId}/shipments`,
      { shipment: untransformFulfillment(data) },
    )
    return transformFulfillment(res.shipment)
  }

  async updateFulfillment(
    credentials: Credentials,
    id: string,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    const colonIdx = id.indexOf(':')
    if (colonIdx === -1) {
      throw new Error('Cafe24 updateFulfillment expects id in `orderId:shipmentCode` format')
    }
    const orderId = id.slice(0, colonIdx)
    const shipmentCode = id.slice(colonIdx + 1)
    const res = await this.client(credentials).put<{ shipment: RawCafe24Shipment }>(
      `orders/${orderId}/shipments/${shipmentCode}`,
      { shipment: untransformFulfillment(data) },
    )
    return transformFulfillment(res.shipment)
  }

  async cancelFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const colonIdx = id.indexOf(':')
    if (colonIdx === -1) {
      throw new Error('Cafe24 cancelFulfillment expects id in `orderId:shipmentCode` format')
    }
    const orderId = id.slice(0, colonIdx)
    const shipmentCode = id.slice(colonIdx + 1)
    const res = await this.client(credentials).put<{ shipment: RawCafe24Shipment }>(
      `orders/${orderId}/shipments/${shipmentCode}`,
      { shipment: { status: 'cancelled' } },
    )
    return transformFulfillment(res.shipment)
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  /**
   * Cafe24 documents no per-order refunds list. `GET /refunds` lists refunds
   * across orders and REQUIRES a date range: `start_date` and `end_date` are
   * both `required: true` ("\`end_date\` must be sent together when this field
   * is used"), filtered on `date_type` whose default is `refund_date` ("refund
   * completed date"). No retention or lookback limit is documented, so the
   * lower bound comes only from `updatedAfter`: without it the call is
   * refused. The upper bound is the end of the current UTC day, so page N is
   * the same request all day. `limit` {maximum 500, default 10} is clamped to
   * the 100-row request limit; `offset` {maximum 15000}. `order_id` is a
   * documented filter and is forwarded when the caller names an order.
   */
  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    if (!(params.updatedAfter instanceof Date) || Number.isNaN(params.updatedAfter.getTime())) {
      throw Object.assign(
        new Error(
          'Cafe24 cannot list refunds without a date range: GET /refunds requires start_date and end_date, and no lookback limit is documented. Pass updatedAfter.',
        ),
        { statusCode: 501, code: 'NOT_SUPPORTED' },
      )
    }
    const { query, size } = this.offsetPage(params)
    query.start_date = cafe24DateTime(params.updatedAfter)
    query.end_date = `${new Date().toISOString().slice(0, 10)}T23:59:59+00:00`
    const orderId = params['order_id'] ?? params['orderId']
    if (typeof orderId === 'string' && orderId !== '') query.order_id = orderId
    const res = await this.client(credentials).listPage<RawCafe24RefundRow>(
      'refunds',
      'refunds',
      query,
    )
    this.reportOffsetPage(params, res.items.length, size)
    return res.items.map(transformRefund)
  }

  /** `GET /refunds/{refund_code}` → `{ refund }`. The id is the refund code. */
  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const res = await this.client(credentials).get<{ refund: RawCafe24RefundDetail }>(
      `refunds/${encodeURIComponent(id)}`,
    )
    return transformRefundDetail(res.refund)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.orderId) throw new Error('createRefund requires orderId')
    const res = await this.client(credentials).post<{ refund: RawCafe24RefundDetail }>(
      `orders/${data.orderId}/refunds`,
      { refund: untransformRefund(data) },
    )
    return transformRefundDetail(res.refund)
  }

  // ── Transactions (synthesised from order payment data) ────────────────────

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const orderId = params['order_id'] ?? params['orderId']
    if (!orderId) {
      throw new Error('Cafe24 listTransactions requires `order_id` in query params')
    }
    // Cafe24 does not have a dedicated transactions endpoint.
    // Synthesise a single transaction from the order payment fields.
    const res = await this.client(credentials).get<{ order: RawCafe24Order }>(
      `orders/${String(orderId)}`,
    )
    const order = res.order
    if (!order) return []
    const payment: RawCafe24Payment = {
      id: `${order.order_id}:payment`,
      order_id: order.order_id,
      payment_method: order['payment_method'] as string | undefined,
      payment_gateway_name: order['payment_gateway_name'] as string | undefined,
      payment_status: order.payment_status,
      actual_price: order.actual_price,
      currency: order.currency,
      order_date: order.order_date,
    }
    return [transformTransaction(payment)]
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    // id format: `orderId:payment`
    const colonIdx = id.indexOf(':')
    const orderId = colonIdx !== -1 ? id.slice(0, colonIdx) : id
    const res = await this.client(credentials).get<{ order: RawCafe24Order }>(`orders/${orderId}`)
    const order = res.order
    const payment: RawCafe24Payment = {
      id,
      order_id: order.order_id,
      payment_method: order['payment_method'] as string | undefined,
      payment_gateway_name: order['payment_gateway_name'] as string | undefined,
      payment_status: order.payment_status,
      actual_price: order.actual_price,
      currency: order.currency,
      order_date: order.order_date,
    }
    return transformTransaction(payment)
  }

  // ── Discounts / Coupons ───────────────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const { query, size } = this.pagedListParams(params)
    const res = await this.client(credentials).listPage<RawCafe24Coupon>(
      'coupons',
      'coupons',
      query,
    )
    this.reportOffsetPage(params, res.items.length, size)
    return res.items.map((c) => transformCoupon(c))
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const res = await this.client(credentials).get<{ coupon: RawCafe24Coupon }>(`coupons/${id}`)
    return transformCoupon(res.coupon)
  }

  async createDiscount(credentials: Credentials, data: Partial<Discount>): Promise<Discount> {
    const res = await this.client(credentials).post<{ coupon: RawCafe24Coupon }>('coupons', {
      coupon: untransformCoupon(data),
    })
    return transformCoupon(res.coupon)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const res = await this.client(credentials).put<{ coupon: RawCafe24Coupon }>(`coupons/${id}`, {
      coupon: untransformCoupon(data),
    })
    return transformCoupon(res.coupon)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`coupons/${id}`)
  }
}
