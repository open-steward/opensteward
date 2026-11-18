/**
 * Zid adapter for the ecommerce vertical.
 *
 * Maps the Zid Merchant REST API (api.zid.sa/v1) to the canonical ecommerce
 * resources. Zid uses OAuth 2.0 authorization code grant with tokens issued by
 * oauth.zid.sa. Access tokens expire in ~1 year; refresh tokens have the same
 * lifespan.
 *
 * Supported resources (those with documented Merchant API endpoints):
 *   - Products (list, get, create, update, delete)
 *   - Collections / Categories (list, get, create, update, delete)
 *   - Customers (list, get, create, update)
 *   - Orders (list, get, create, updateOrder via status change)
 *   - Fulfillments (derived from order shipping — list, get)
 *   - Discounts / Coupons (list, get, create, update, delete)
 *
 * Not supported (no documented Merchant API endpoint):
 *   - Variants (standalone CRUD; accessible via extended product list)
 *   - Locations (no dedicated endpoint; slug-based from product stocks)
 *   - Inventory levels (derived from product.stocks)
 *   - Refunds (no listing endpoint; payment_status on order signals refund)
 *   - Transactions (synthesised from order payment fields)
 *   - Webhooks HMAC signature (Zid uses Basic Auth on webhooks, not HMAC)
 *
 * Docs: https://docs.zid.sa/authorization
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import { pageLocally, pageOffset, reportUpstreamPage } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Discount } from '../../schema/discount'

import { buildAuthUrl, exchangeCode as zidExchangeCode, refreshAccessToken } from './auth'
import { ZidClient } from './client'
import { DEFAULT_PAGE_SIZE, DEFAULT_SCOPES } from './constants'

import { transformProduct, untransformProduct, type RawZidProduct } from './transform/product'
import { transformCollection, untransformCollection, type RawZidCategory } from './transform/collection'
import { transformCustomer, untransformCustomer, type RawZidCustomer } from './transform/customer'
import { transformOrder, untransformOrder, type RawZidOrder } from './transform/order'
import { transformFulfillment } from './transform/fulfillment'
import { transformDiscount, untransformDiscount, type RawZidCoupon } from './transform/discount'

/** The `pagination` block in Zid's List Categories response example. */
interface ZidPagination {
  page?: number
  page_size?: number
  next_page?: number | null
  last_page?: number
  result_count?: number
}

/** Does a response's pagination block say rows exist beyond this response? */
function hasFurtherPages(p: ZidPagination | null | undefined): boolean {
  if (!p) return false
  if (p.next_page !== null && p.next_page !== undefined) return true
  return typeof p.last_page === 'number' && typeof p.page === 'number' && p.last_page > p.page
}

export interface ZidAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

export class ZidAdapter implements EcommerceAdapter {
  readonly platform = 'zid'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: ZidAdapterConfig) {
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
    return zidExchangeCode(code, this.clientId, this.clientSecret, this.redirectUri)
  }

  /**
   * Zid tokens expire in ~1 year. If a refreshToken is present and the access
   * token has expired (or is close to expiry), obtain a new one.
   */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) return credentials
    return refreshAccessToken(
      credentials.refreshToken,
      this.clientId,
      this.clientSecret,
      this.redirectUri,
    )
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): ZidClient {
    return new ZidClient(credentials)
  }

  /** Build page params from canonical QueryParams. */
  private pageParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      per_page: params.limit ?? DEFAULT_PAGE_SIZE,
      page: params['page'] ?? 1,
    }
    if (params.updatedAfter) {
      out.date_from = params.updatedAfter.toISOString().slice(0, 10)
      out.date_attribute = 'updated_at'
    }
    return out
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).listProducts<RawZidProduct>({
      page_size: params.limit ?? DEFAULT_PAGE_SIZE,
      page: params['page'] ?? 1,
      extended: true,
    })
    return res.items.map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<{ product?: RawZidProduct } & RawZidProduct>(
      `/products/${id}/`,
    )
    // Some endpoints wrap in { product: ... }, others return the object directly.
    const raw = (res as { product?: RawZidProduct }).product ?? (res as RawZidProduct)
    return transformProduct(raw)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const res = await this.client(credentials).post<RawZidProduct>(
      '/products/',
      untransformProduct(data),
    )
    return transformProduct(res)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const res = await this.client(credentials).put<RawZidProduct>(
      `/products/${id}/`,
      untransformProduct(data),
    )
    return transformProduct(res)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/products/${id}/`)
  }

  // ── Collections (Categories) ──────────────────────────────────────────────

  /**
   * GET /v1/managers/store/categories documents no query parameters and
   * "Fetches all the available categories for a certain store"
   * (https://docs.zid.sa/get-all-categories), so the whole list is fetched and
   * sliced locally.
   *
   * The same page's response example carries a `pagination` block (page_size
   * 100, next_page 2) that no parameter documents. When a response says more
   * pages exist, the rows in hand are not the collection: windows inside them
   * are served with `hasMore: true` and no total, and a window past them
   * throws rather than coming back as an empty, final page.
   */
  async listCollections(credentials: Credentials, params: QueryParams): Promise<Collection[]> {
    const res = await this.client(credentials).get<{
      categories?: RawZidCategory[]
      pagination?: ZidPagination | null
    }>('/managers/store/categories')
    const rows = (res.categories ?? []).map(transformCollection)
    const page = pageLocally(rows, params)
    if (!hasFurtherPages(res.pagination)) return page

    const limit = params.limit
    const size =
      typeof limit === 'number' && Number.isFinite(limit) && limit >= 1
        ? Math.floor(limit)
        : undefined
    if (size === undefined || pageOffset(params, size) >= rows.length) {
      throw Object.assign(
        new Error(
          `Zid returned ${rows.length} categories and reports more categories ` +
            `(pagination.next_page=${String(res.pagination?.next_page)}), but documents ` +
            'no parameter to fetch them; this window cannot be served.',
        ),
        { statusCode: 502, code: 'UPSTREAM_INCOMPLETE' },
      )
    }
    reportUpstreamPage(params, { totalCount: undefined, hasMore: true })
    return page
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    // Zid categories are returned in the list; find by id.
    const res = await this.client(credentials).get<{ categories?: RawZidCategory[] }>(
      '/managers/store/categories',
    )
    const cats = res.categories ?? []
    const cat = cats.find((c) => String(c.id) === id || c.uuid === id)
    if (!cat) throw new Error(`Category not found: ${id}`)
    return transformCollection(cat)
  }

  async createCollection(
    credentials: Credentials,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const res = await this.client(credentials).post<{ category?: RawZidCategory } & RawZidCategory>(
      '/managers/store/categories',
      untransformCollection(data),
    )
    const raw = (res as { category?: RawZidCategory }).category ?? (res as RawZidCategory)
    return transformCollection(raw)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const res = await this.client(credentials).put<{ category?: RawZidCategory } & RawZidCategory>(
      `/managers/store/categories/${id}`,
      untransformCollection(data),
    )
    const raw = (res as { category?: RawZidCategory }).category ?? (res as RawZidCategory)
    return transformCollection(raw)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/managers/store/categories/${id}`)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const res = await this.client(credentials).listPage<RawZidCustomer>(
      '/managers/store/customers',
      'customers',
      this.pageParams(params),
    )
    return res.items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).get<{ customer?: RawZidCustomer } & RawZidCustomer>(
      `/managers/store/customers/${id}`,
    )
    const raw = (res as { customer?: RawZidCustomer }).customer ?? (res as RawZidCustomer)
    return transformCustomer(raw)
  }

  async createCustomer(
    credentials: Credentials,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const res = await this.client(credentials).post<{ customer?: RawZidCustomer } & RawZidCustomer>(
      '/managers/store/customers',
      untransformCustomer(data),
    )
    const raw = (res as { customer?: RawZidCustomer }).customer ?? (res as RawZidCustomer)
    return transformCustomer(raw)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const res = await this.client(credentials).put<{ customer?: RawZidCustomer } & RawZidCustomer>(
      `/managers/store/customers/${id}`,
      untransformCustomer(data),
    )
    const raw = (res as { customer?: RawZidCustomer }).customer ?? (res as RawZidCustomer)
    return transformCustomer(raw)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const res = await this.client(credentials).listPage<RawZidOrder>(
      '/managers/store/orders',
      'orders',
      { ...this.pageParams(params), payload_type: 'default' },
    )
    return res.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const res = await this.client(credentials).get<{ order?: RawZidOrder } & RawZidOrder>(
      `/managers/store/orders/${id}`,
    )
    const raw = (res as { order?: RawZidOrder }).order ?? (res as RawZidOrder)
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    // Zid creates orders via the draft endpoint.
    const res = await this.client(credentials).post<{ order?: RawZidOrder } & RawZidOrder>(
      '/managers/store/drafts',
      untransformOrder(data),
    )
    const raw = (res as { order?: RawZidOrder }).order ?? (res as RawZidOrder)
    return transformOrder(raw)
  }

  async updateOrder(
    credentials: Credentials,
    id: string,
    data: Partial<Order>,
  ): Promise<Order> {
    // Zid allows updating order status via change-order-status.
    // Map canonical fulfillmentStatus back to a Zid status code.
    const statusMap: Record<string, string> = {
      UNFULFILLED: 'new',
      PARTIAL: 'preparing',
      FULFILLED: 'delivered',
    }
    const orderStatus = data.fulfillmentStatus
      ? statusMap[data.fulfillmentStatus] ?? 'new'
      : 'new'
    const res = await this.client(credentials).post<{ order?: RawZidOrder } & RawZidOrder>(
      `/managers/store/orders/${id}/change-order-status`,
      { order_status: orderStatus },
    )
    const raw = (res as { order?: RawZidOrder }).order ?? (res as RawZidOrder)
    return transformOrder(raw)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Order> {
    const res = await this.client(credentials).post<{ order?: RawZidOrder } & RawZidOrder>(
      `/managers/store/orders/${id}/change-order-status`,
      { order_status: 'canceled' },
    )
    const raw = (res as { order?: RawZidOrder }).order ?? (res as RawZidOrder)
    return transformOrder(raw)
  }

  // ── Fulfillments ──────────────────────────────────────────────────────────
  // Fulfillment data is derived from the order's shipping info.

  async listFulfillments(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Fulfillment[]> {
    const orderId = params['order_id'] ?? params['orderId']
    if (!orderId) {
      throw new Error('listFulfillments requires `order_id` in query params')
    }
    const res = await this.client(credentials).get<{ order?: RawZidOrder } & RawZidOrder>(
      `/managers/store/orders/${String(orderId)}`,
    )
    const raw = (res as { order?: RawZidOrder }).order ?? (res as RawZidOrder)
    return [transformFulfillment(raw)]
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    // id is the order id (Zid has one fulfillment per order)
    const res = await this.client(credentials).get<{ order?: RawZidOrder } & RawZidOrder>(
      `/managers/store/orders/${id}`,
    )
    const raw = (res as { order?: RawZidOrder }).order ?? (res as RawZidOrder)
    return transformFulfillment(raw)
  }

  // ── Discounts (Coupons) ───────────────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const res = await this.client(credentials).listPage<RawZidCoupon>(
      '/managers/store/coupons',
      'coupons',
      this.pageParams(params),
    )
    return res.items.map(transformDiscount)
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const res = await this.client(credentials).get<{ coupon?: RawZidCoupon } & RawZidCoupon>(
      `/managers/store/coupons/${id}`,
    )
    const raw = (res as { coupon?: RawZidCoupon }).coupon ?? (res as RawZidCoupon)
    return transformDiscount(raw)
  }

  async createDiscount(
    credentials: Credentials,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const res = await this.client(credentials).post<{ coupon?: RawZidCoupon } & RawZidCoupon>(
      '/managers/store/coupons',
      untransformDiscount(data),
    )
    const raw = (res as { coupon?: RawZidCoupon }).coupon ?? (res as RawZidCoupon)
    return transformDiscount(raw)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const res = await this.client(credentials).put<{ coupon?: RawZidCoupon } & RawZidCoupon>(
      `/managers/store/coupons/${id}`,
      untransformDiscount(data),
    )
    const raw = (res as { coupon?: RawZidCoupon }).coupon ?? (res as RawZidCoupon)
    return transformDiscount(raw)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/managers/store/coupons/${id}`)
  }
}
