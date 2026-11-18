/**
 * FastSpring adapter for the ecommerce vertical.
 *
 * FastSpring is a merchant-of-record platform for digital-goods / SaaS
 * checkout and subscription billing — no physical fulfilment. Maps the
 * FastSpring REST API (https://developer.fastspring.com/reference/api-overview)
 * to the canonical ecommerce resources it genuinely has: products, accounts
 * (→ customers), orders, returns (→ refunds), coupons (→ discounts).
 *
 * Auth is HTTP Basic with a merchant-generated API username/password pair —
 * there is no OAuth flow (see ./auth.ts and the Connect Link form below).
 *
 * See ./metadata.ts for the full available/unavailable resource breakdown,
 * and the transform/*.ts files for per-resource doc citations and mapping
 * notes (including two deliberate omissions: `listVariants`/`listCollections`
 * /etc. because the platform has no such resources at all, and `listRefunds`
 * specifically because FastSpring documents `GET /returns/{id}` and
 * `POST /returns` but no bulk "list all returns" endpoint).
 */

import { customForm } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { reportUpstreamPage, pageLocally, withPageSink, readUpstreamPage } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Refund } from '../../schema/refund'
import type { Discount } from '../../schema/discount'
import type { WebhookEvent } from '../../schema/webhook'

import { buildAuthUrl, exchangeCode as fastspringExchangeCode } from './auth'
import { FastSpringClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { verifyFastSpringWebhook, parseFastSpringWebhookEvents } from './webhook'

import {
  transformProduct,
  untransformProduct,
  type RawFastSpringProduct,
} from './transform/product'
import { transformCustomer, untransformCustomer, type RawFastSpringAccount } from './transform/customer'
import { transformOrder, untransformOrderTags, type RawFastSpringOrder } from './transform/order'
import { transformRefund, untransformRefund, type RawFastSpringReturn } from './transform/refund'
import {
  transformDiscount,
  untransformDiscount,
  type RawFastSpringCoupon,
} from './transform/discount'

// ── Connect Link form (API username + password, HTTP Basic) ────────────────

const FASTSPRING_FORM = customForm({
  fields: [
    {
      name: 'apiUsername',
      label: 'API username',
      type: 'text',
      required: true,
      helpText:
        'Generated in the FastSpring dashboard under Developer Tools → APIs → API Credentials.',
    },
    {
      name: 'apiPassword',
      label: 'API password',
      type: 'password',
      required: true,
      helpText: 'Shown once, alongside the API username, when the credential pair is generated.',
    },
  ],
  async exchange(fields): Promise<Credentials> {
    const apiUsername = (fields['apiUsername'] ?? '').trim()
    const apiPassword = (fields['apiPassword'] ?? '').trim()
    if (!apiUsername || !apiPassword) {
      throw new Error('API username and API password are both required.')
    }
    return {
      accessToken: apiUsername,
      extra: { apiUsername, apiPassword },
    }
  },
})

export class FastspringAdapter implements EcommerceAdapter {
  readonly platform = 'fastspring'
  readonly version = '0.1.0'
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  // Connect Link support
  credentialFields = FASTSPRING_FORM.credentialFields
  exchangeCredentials = FASTSPRING_FORM.exchangeCredentials

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(): string {
    return buildAuthUrl()
  }

  async exchangeCode(): Promise<Credentials> {
    return fastspringExchangeCode()
  }

  /** FastSpring API credentials are a static username/password pair — they don't expire. */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyFastSpringWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseFastSpringWebhookEvents(payload)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): FastSpringClient {
    return new FastSpringClient(credentials)
  }

  private pageParams(params: QueryParams): { page: number; limit: number } {
    return {
      page: params.page ?? 1,
      limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    }
  }

  // ── Products ──────────────────────────────────────────────────────────────
  // https://developer.fastspring.com/reference/products

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const client = this.client(credentials)
    const { page, limit } = this.pageParams(params)
    const list = await client.listIds('/products', 'products', { page, limit })
    reportUpstreamPage(params, { hasMore: list.nextPage != null, totalCount: list.total, currentPage: list.page })
    const items = await Promise.all(
      list.ids.map((id) => client.get<{ products: RawFastSpringProduct[] }>(`/products/${id}`)),
    )
    return items.map((res) => transformProduct(res.products[0]!))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<{ products: RawFastSpringProduct[] }>(
      `/products/${id}`,
    )
    return transformProduct(res.products[0]!)
  }

  /**
   * FastSpring assigns no product id automatically — the caller must choose
   * the path/id up front (see https://developer.fastspring.com/reference/create-or-update-products,
   * whose only example always sets `product`).
   */
  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    if (!data.id) {
      throw new Error(
        'createProduct requires id (FastSpring has no auto-generated product id — choose the path).',
      )
    }
    const body = untransformProduct(data)
    await this.client(credentials).post('/products', { products: [body] })
    return this.getProduct(credentials, data.id)
  }

  async updateProduct(credentials: Credentials, id: string, data: Partial<Product>): Promise<Product> {
    const body = { ...untransformProduct(data), product: id }
    await this.client(credentials).post('/products', { products: [body] })
    return this.getProduct(credentials, id)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/products/${id}`)
  }

  // ── Customers (Accounts) ─────────────────────────────────────────────────
  // https://developer.fastspring.com/reference/accounts

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const client = this.client(credentials)
    const { page, limit } = this.pageParams(params)
    const list = await client.listIds('/accounts', 'accounts', { page, limit })
    reportUpstreamPage(params, { hasMore: list.nextPage != null, totalCount: list.total, currentPage: list.page })
    const items = await Promise.all(
      list.ids.map((id) => client.get<RawFastSpringAccount>(`/accounts/${id}`)),
    )
    return items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const raw = await this.client(credentials).get<RawFastSpringAccount>(`/accounts/${id}`)
    return transformCustomer(raw)
  }

  /**
   * The documented `POST /accounts` response is the minimal
   * `{ account, id, action, result }` — not the full account object — so
   * this re-fetches via the documented GET rather than assuming a response
   * shape that was never shown.
   */
  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const client = this.client(credentials)
    const res = await client.post<{ account: string }>('/accounts', untransformCustomer(data))
    return this.getCustomer(credentials, res.account)
  }

  async updateCustomer(credentials: Credentials, id: string, data: Partial<Customer>): Promise<Customer> {
    await this.client(credentials).post(`/accounts/${id}`, untransformCustomer(data))
    return this.getCustomer(credentials, id)
  }

  // No deleteCustomer — FastSpring accounts cannot be deleted via the API
  // (see ./metadata.ts is unnecessary here since `customer` stays available;
  // this is documented directly on the interface method's absence).

  // ── Orders ────────────────────────────────────────────────────────────────
  // https://developer.fastspring.com/reference/orders

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = this.client(credentials)
    const { page, limit } = this.pageParams(params)
    const extra: Record<string, unknown> = { page, limit }
    if (params.updatedAfter) extra['begin'] = params.updatedAfter.toISOString().slice(0, 10)
    const list = await client.listIds('/orders', 'orders', extra)
    reportUpstreamPage(params, { hasMore: list.nextPage != null, totalCount: list.total, currentPage: list.page })
    const items = await Promise.all(
      list.ids.map((id) => client.get<RawFastSpringOrder>(`/orders/${id}`)),
    )
    return items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const raw = await this.client(credentials).get<RawFastSpringOrder>(`/orders/${id}`)
    return transformOrder(raw)
  }

  /**
   * The only documented order mutation is tags/attributes (see
   * transform/order.ts). There is no create (orders come from checkout
   * sessions, not the API) and no cancel (see returns/refunds instead).
   */
  async updateOrder(credentials: Credentials, id: string, data: Partial<Order>): Promise<Order> {
    const body = { ...untransformOrderTags(data), order: id }
    await this.client(credentials).post('/orders', { orders: [body] })
    return this.getOrder(credentials, id)
  }

  // ── Refunds (Returns) ────────────────────────────────────────────────────
  // https://developer.fastspring.com/reference/returns
  //
  // No listRefunds: FastSpring documents `GET /returns/{id}` and
  // `POST /returns` but no bulk "list all returns" endpoint (unlike
  // products/orders/accounts/coupons, which each have a documented
  // "List All …" page — returns has none). Enumerate via order-level
  // `return.created` webhook events instead of polling.

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const res = await this.client(credentials).get<{ returns: RawFastSpringReturn[] }>(
      `/returns/${id}`,
    )
    return transformRefund(res.returns[0]!)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.orderId) throw new Error('createRefund requires orderId')
    const res = await this.client(credentials).post<{ returns: RawFastSpringReturn[] }>(
      '/returns',
      { returns: [untransformRefund(data)] },
    )
    return transformRefund(res.returns[0]!)
  }

  // ── Discounts (Coupons) ──────────────────────────────────────────────────
  // https://developer.fastspring.com/reference/coupons-overview

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const client = this.client(credentials)
    // GET /coupons takes no parameters and "Returns an array of all coupon
    // path identifiers." (https://developer.fastspring.com/reference/list-all-coupons)
    // — the whole collection, no page/limit/total. Window it locally.
    const list = await client.listIds('/coupons', 'coupons', {})
    // Each id costs one GET (250 calls/IP/minute), so the window keeps the
    // adapter's own cap and default rather than pageLocally's "no limit =
    // everything". A clamp below the caller's limit is reported as pageSize.
    const requested =
      typeof params.limit === 'number' && Number.isFinite(params.limit) && params.limit >= 1
        ? Math.floor(params.limit)
        : undefined
    const size = Math.min(requested ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const window = withPageSink({ ...params, limit: size })
    const pageIds = pageLocally(list.ids, window)
    reportUpstreamPage(params, {
      ...readUpstreamPage(window),
      ...(requested !== undefined && size < requested ? { pageSize: size } : {}),
    })
    const items = await Promise.all(
      pageIds.map((id) => client.get<RawFastSpringCoupon>(`/coupons/${id}`)),
    )
    return items.map(transformDiscount)
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const raw = await this.client(credentials).get<RawFastSpringCoupon>(`/coupons/${id}`)
    return transformDiscount(raw)
  }

  async createDiscount(credentials: Credentials, data: Partial<Discount>): Promise<Discount> {
    if (!data.id) throw new Error('createDiscount requires id (FastSpring coupon path identifier)')
    await this.client(credentials).post('/coupons', untransformDiscount(data))
    return this.getDiscount(credentials, data.id)
  }

  async updateDiscount(credentials: Credentials, id: string, data: Partial<Discount>): Promise<Discount> {
    await this.client(credentials).post('/coupons', { ...untransformDiscount(data), coupon: id })
    return this.getDiscount(credentials, id)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/coupons/${id}`)
  }
}
