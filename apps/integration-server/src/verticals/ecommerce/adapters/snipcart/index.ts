/**
 * Snipcart adapter for the ecommerce vertical.
 *
 * Maps the Snipcart REST API to the canonical ecommerce resources.
 *
 * Auth: HTTP Basic — API key as the username, empty password, base64-encoded.
 * The key is stored in `credentials.accessToken` via the `simpleApiKey` form.
 *
 * Resources supported by Snipcart's REST API:
 *  - Products    (list, get, update inventory, delete/archive)
 *  - Customers   (list, get)
 *  - Orders      (list, get, update, cancel)
 *  - Refunds     (list, get, create — scoped to an order)
 *  - Discounts   (list, get, create, update, delete)
 *
 * Resources NOT supported (auto-501):
 *  - Collections, Locations, Inventory, Fulfillments, Transactions, Variants
 *
 * Docs: https://docs.snipcart.com/v3/api-reference/introduction
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: collection    — Snipcart has no product collections concept or endpoint.
// Unavailable: fulfillment   — No fulfillment sub-resource; tracking fields are embedded on the order.
// Unavailable: inventory     — Stock count is on the product/variant object; no inventory-level endpoint.
// Unavailable: location      — Snipcart does not support multi-location warehousing.
// Unavailable: transaction   — Payment status is on the order object; no standalone transaction endpoint.

import type { Credentials, QueryParams } from '@opensteward/shared'
import { pageLocally, pageOffset, reportUpstreamPage } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Refund } from '../../schema/refund'
import type { Discount } from '../../schema/discount'
import type { WebhookEvent } from '../../schema/webhook'

import { SNIPCART_API_KEY_FORM } from './auth'
import { SnipcartClient, type SnipcartListResponse } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { verifySnipcartWebhook, parseSnipcartWebhookEvents } from './webhook'

import { transformProduct, type RawSnipcartProduct } from './transform/product'
import { transformCustomer, type RawSnipcartCustomer } from './transform/customer'
import {
  transformOrder,
  untransformOrder,
  type RawSnipcartOrder,
} from './transform/order'
import {
  transformRefund,
  untransformRefund,
  type RawSnipcartRefund,
} from './transform/refund'
import {
  transformDiscount,
  untransformDiscount,
  type RawSnipcartDiscount,
} from './transform/discount'

export class SnipcartAdapter implements EcommerceAdapter {
  readonly platform = 'snipcart'
  readonly version = '0.1.0'

  // ── Credential form (simpleApiKey template) ───────────────────────────────

  credentialFields = SNIPCART_API_KEY_FORM.credentialFields
  exchangeCredentials = SNIPCART_API_KEY_FORM.exchangeCredentials

  // ── Auth ──────────────────────────────────────────────────────────────────

  /**
   * Snipcart does not use OAuth2 — there is no auth URL. Return a link to
   * the dashboard API keys page as an informational fallback.
   */
  getAuthUrl(_state: string): string {
    return 'https://app.snipcart.com/dashboard/account/credentials'
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error(
      'Snipcart does not use OAuth code exchange. ' +
        'Provide your secret API key via the credential form instead.',
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Snipcart API keys do not expire.
    return credentials
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifySnipcartWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseSnipcartWebhookEvents(payload)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): SnipcartClient {
    return new SnipcartClient(credentials)
  }

  /**
   * One caller page of an offset-paged collection (products, customers,
   * orders). Snipcart documents `offset` ("Number of items to skip") and
   * `limit`, with no maximum, and answers `{ totalItems, offset, limit, items }`.
   * The caller's 1-based `page` becomes `offset = (page - 1) × limit`, and
   * `totalItems` makes `hasMore` exact.
   *
   * `totalItems` is trusted only when it is present and the page is not
   * empty. A missing total is never read as 0 (that would mark page 1 as the
   * whole collection), and an empty page ends the walk even if the total
   * still claims more rows (otherwise a shrinking collection would keep
   * `hasMore` true until the sync worker's page cap). In both cases the
   * next signal falls back to "a full page came back".
   */
  private async pagedList<T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
  ): Promise<T[]> {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const offset = pageOffset(params, limit)
    const query: Record<string, unknown> = { limit, offset }
    if (params.updatedAfter) query['from'] = params.updatedAfter.toISOString()
    const res = await this.client(credentials).get<Partial<SnipcartListResponse<T>> | null>(
      path,
      query,
    )
    const items = Array.isArray(res?.items) ? res.items : []
    const total = res?.totalItems
    if (typeof total === 'number' && items.length > 0) {
      reportUpstreamPage(params, {
        totalCount: total,
        hasMore: offset + items.length < total,
      })
    } else {
      reportUpstreamPage(params, { hasMore: items.length > 0 && items.length >= limit })
    }
    return items
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const rows = await this.pagedList<RawSnipcartProduct>(credentials, 'products', params)
    return rows.map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const raw = await this.client(credentials).get<RawSnipcartProduct>(`products/${id}`)
    return transformProduct(raw)
  }

  /**
   * Update a product's stock/inventory level.
   * Snipcart does not allow creating products via the API — only updates.
   */
  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const body: Record<string, unknown> = {}
    // Snipcart PUT /products/{id} accepts stock and allowOutOfStockPurchases.
    const stockMeta = data.metadata?.['stock']
    if (stockMeta != null) body['stock'] = stockMeta
    const raw = await this.client(credentials).put<RawSnipcartProduct>(`products/${id}`, body)
    return transformProduct(raw)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`products/${id}`)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const rows = await this.pagedList<RawSnipcartCustomer>(credentials, 'customers', params)
    return rows.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const raw = await this.client(credentials).get<RawSnipcartCustomer>(`customers/${id}`)
    return transformCustomer(raw)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const rows = await this.pagedList<RawSnipcartOrder>(credentials, 'orders', params)
    return rows.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const raw = await this.client(credentials).get<RawSnipcartOrder>(`orders/${id}`)
    return transformOrder(raw)
  }

  async updateOrder(
    credentials: Credentials,
    id: string,
    data: Partial<Order>,
  ): Promise<Order> {
    const raw = await this.client(credentials).put<RawSnipcartOrder>(
      `orders/${id}`,
      untransformOrder(data),
    )
    return transformOrder(raw)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Order> {
    const raw = await this.client(credentials).put<RawSnipcartOrder>(`orders/${id}`, {
      status: 'Cancelled',
    })
    return transformOrder(raw)
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const orderId = (params['order_id'] ?? params['orderId']) as string | undefined
    if (!orderId) {
      throw new Error('listRefunds requires `order_id` in query params')
    }
    // "Returns every refund issued against the order identified by token." —
    // https://docs.snipcart.com/v3/api-reference/refunds. The response is a
    // bare JSON array and no query parameters are documented, so the whole
    // list is fetched and one caller page is sliced from it.
    const raw = await this.client(credentials).get<RawSnipcartRefund[]>(
      `orders/${orderId}/refunds`,
    )
    return pageLocally(
      (Array.isArray(raw) ? raw : []).map((r) => transformRefund(r, orderId)),
      params,
    )
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    // Composite id format: `orderToken:refundId`
    const [orderToken, refundId] = id.split(':')
    if (!orderToken || !refundId) {
      throw new Error('Invalid refund id format: expected `orderToken:refundId`')
    }
    const raw = await this.client(credentials).get<RawSnipcartRefund>(
      `orders/${orderToken}/refunds/${refundId}`,
    )
    return transformRefund(raw, orderToken)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.orderId) throw new Error('createRefund requires orderId')
    const currency = data.amount?.currency ?? 'USD'
    const raw = await this.client(credentials).post<RawSnipcartRefund>(
      `orders/${data.orderId}/refunds`,
      untransformRefund(data, currency),
    )
    return transformRefund(raw, data.orderId)
  }

  // ── Discounts ─────────────────────────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    // "Returns every discount on your account (no pagination — the full list is
    // returned as a JSON array)." — https://docs.snipcart.com/v3/api-reference/discounts
    // No query parameters are documented, so the whole list is fetched and one
    // caller page is sliced from it.
    const raw = await this.client(credentials).get<RawSnipcartDiscount[]>('discounts')
    return pageLocally((Array.isArray(raw) ? raw : []).map(transformDiscount), params)
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const raw = await this.client(credentials).get<RawSnipcartDiscount>(`discounts/${id}`)
    return transformDiscount(raw)
  }

  async createDiscount(credentials: Credentials, data: Partial<Discount>): Promise<Discount> {
    const raw = await this.client(credentials).post<RawSnipcartDiscount>(
      'discounts',
      untransformDiscount(data),
    )
    return transformDiscount(raw)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const raw = await this.client(credentials).put<RawSnipcartDiscount>(
      `discounts/${id}`,
      untransformDiscount(data),
    )
    return transformDiscount(raw)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`discounts/${id}`)
  }
}
