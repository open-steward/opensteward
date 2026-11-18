/**
 * Mercado Libre adapter for the ecommerce vertical.
 *
 * Maps Mercado Libre's REST APIs to the canonical ecommerce resources.
 * Mercado Libre is LatAm's dominant marketplace (16M+ sellers), seller-scoped,
 * OAuth2 authorization-code flow.
 *
 * Slug: `mercadolibre`
 * Platform identifier: `mercadolibre`
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented:
 *
 *   Products:     list, get, create, update, delete   (Items API)
 *   Inventory:    list, get, adjust, set              (Items API available_quantity)
 *   Orders:       list, get                           (Orders API)
 *   Fulfillments: list, get                           (Shipments API)
 *   Refunds:      list, get, create                   (Payments API refunds)
 *   Transactions: list, get                           (Payments on orders)
 *   Collections:  list, get                           (Categories API — platform-managed, read-only)
 *   Customers:    get                                 (Customer Data Access API — requires ML CDA certification;
 *                                                      list refuses with 501, see listCustomers)
 *   Discounts:    list, get                           (Seller Promotions API)
 *
 * ── Resource coverage ──────────────────────────────────────────────────────────
 * Unavailable: location — ML has no dedicated seller-location listing endpoint;
 *              warehouse identifiers surface only as stock metadata (seller_warehouse
 *              type in user-products stock API) without addressable canonical fields.
 *
 * Omitted write operations — the registry will return HTTP 501 automatically:
 *
 *   createCollection, updateCollection, deleteCollection — ML categories are platform-managed.
 *   createCustomer, updateCustomer, deleteCustomer — read-only CDA access; no write API.
 *   updateDiscount, deleteDiscount — not exposed via public seller-promotions API.
 *   createOrder, updateOrder, cancelOrder — buyers create orders on the marketplace.
 *   createFulfillment, updateFulfillment, cancelFulfillment — ML manages shipping.
 *   createTransaction — ML/MercadoPago controls transactions.
 *   Variants (5) — ML has variations as item attributes, not standalone resources.
 *
 * Webhooks: ML Notifications via HTTPS POST — verifier + parser implemented.
 */

import {
  pageOffset,
  reportUpstreamPage,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { InventoryLevel } from '../../schema/inventory'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Refund } from '../../schema/refund'
import type { Transaction } from '../../schema/transaction'
import type { Collection } from '../../schema/collection'
import type { Customer } from '../../schema/customer'
import type { Discount } from '../../schema/discount'
import type { WebhookEvent } from '../../schema/webhook'

import {
  buildAuthUrl,
  exchangeCode as meliExchangeCode,
  refreshCredentials as meliRefreshCredentials,
} from './auth'
import { MeliClient } from './client'
import {
  DEFAULT_PAGE_SIZE,
  ITEMS_BASE,
  ITEMS_MULTIGET_MAX_IDS,
  ITEMS_SEARCH_MAX_LIMIT,
  ORDERS_BASE,
  SEARCH_SAFE_LIMIT,
  SHIPMENTS_BASE,
  CATEGORIES_BASE,
  USERS_BASE,
} from './constants'
import { transformProduct, untransformProduct, type RawMeliItem } from './transform/product'
import { transformInventoryLevel } from './transform/inventory'
import { transformOrder, type RawMeliOrder } from './transform/order'
import { transformFulfillment, type RawMeliShipment } from './transform/fulfillment'
import { transformRefund, untransformRefund, type RawMeliRefund } from './transform/refund'
import { transformTransaction, type RawMeliPayment } from './transform/transaction'
import {
  transformCollection,
  type RawMeliCategory,
  type RawMeliCategoryRef,
} from './transform/collection'
import { transformCustomer, type RawMeliCdaEnvelope } from './transform/customer'
import {
  transformDiscount,
  type RawMeliPromotion,
  type RawMeliPromotionListEnvelope,
} from './transform/discount'

// ── Response envelopes ────────────────────────────────────────────────────────

interface RawSearchEnvelope {
  results?: string[] // Item IDs — ML search returns IDs, not full items
  paging?: {
    total?: number
    offset?: number
    limit?: number
  }
}

interface RawOrdersSearchEnvelope {
  results?: RawMeliOrder[]
  paging?: {
    total?: number
    offset?: number
    limit?: number
  }
}

/**
 * Report one offset/limit page: the size asked for, the platform's total, and
 * hasMore from the search page itself (offset + rows on this page < total), so
 * the sync worker never has to infer the end from a short page.
 */
function reportOffsetPage(
  params: QueryParams,
  paging: { total?: number } | undefined,
  offset: number,
  pageRows: number,
  limit: number,
): void {
  const total = paging?.total
  reportUpstreamPage(params, {
    pageSize: limit,
    ...(typeof total === 'number'
      ? { totalCount: total, hasMore: pageRows > 0 && offset + pageRows < total }
      : {}),
  })
}

export interface MercadoLibreAdapterConfig {
  /** Mercado Libre app id (client_id). Optional — may come from credentials. */
  clientId?: string
  /** Mercado Libre client secret. Optional — may come from credentials. */
  clientSecret?: string
  /** Default OAuth2 redirect URI. */
  redirectUri?: string
  /** Webhook secret for notification verification. */
  webhookSecret?: string
}

export class MercadoLibreAdapter implements EcommerceAdapter {
  readonly platform = 'mercadolibre'
  readonly version = '0.1.0'

  private configClientId: string | undefined
  private configClientSecret: string | undefined
  private configRedirectUri: string | undefined
  private configWebhookSecret: string | undefined

  constructor(config: MercadoLibreAdapterConfig = {}) {
    this.configClientId = config.clientId
    this.configClientSecret = config.clientSecret
    this.configRedirectUri = config.redirectUri
    this.configWebhookSecret = config.webhookSecret
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    const clientId = this.configClientId
    if (!clientId) {
      throw new Error(
        'Mercado Libre adapter getAuthUrl requires clientId — configure it in ' +
          'apps/integration-server/config/config.yml under adapters.mercadolibre.',
      )
    }
    const redirectUri = this.configRedirectUri ?? ''
    return buildAuthUrl(clientId, redirectUri, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    const clientId = this.configClientId
    const clientSecret = this.configClientSecret
    if (!clientId || !clientSecret) {
      throw new Error(
        'Mercado Libre adapter exchangeCode requires clientId and clientSecret — configure them in ' +
          'apps/integration-server/config/config.yml under adapters.mercadolibre.',
      )
    }
    return meliExchangeCode(code, redirectUri, clientId, clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return meliRefreshCredentials(credentials)
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  verifyWebhookSignature(
    payload: Record<string, unknown>,
    headers: Record<string, string>,
  ): boolean {
    // ML sends notifications with a signature header when a webhook secret is
    // configured. This adapter validates only the notification structure
    // (topic + resource); it does not verify the signature header.
    const userAgent = headers['user-agent'] ?? ''
    if (!userAgent.includes('MercadoLibre') && !payload['resource']) return false
    return typeof payload['topic'] === 'string' && typeof payload['resource'] === 'string'
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    const topic = payload['topic'] as string | undefined
    const resource = payload['resource'] as string | undefined
    const userId = payload['user_id'] as number | undefined

    let resourceType: WebhookEvent['resourceType'] = 'unknown'
    const action: WebhookEvent['action'] = 'updated'

    if (topic) {
      switch (topic) {
        case 'items':
          resourceType = 'products'
          break
        case 'orders_v2':
        case 'orders':
          resourceType = 'orders'
          break
        case 'shipments':
          resourceType = 'fulfillments'
          break
        case 'payments':
          resourceType = 'transactions'
          break
        case 'questions':
          resourceType = 'unknown'
          break
      }
    }

    // ML notifications are always "updated" — they notify of a resource change
    // but don't differentiate create/update/delete in the notification payload.
    const resourceId = resource
      ? (resource.split('/').filter(Boolean).pop() ?? 'unknown')
      : 'unknown'

    return [
      {
        id: payload['_id'] as string | undefined,
        platform: 'mercadolibre',
        type: topic ?? 'unknown',
        resourceType,
        action,
        resourceId,
        tenantId: userId ? String(userId) : undefined,
        payload,
      },
    ]
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): MeliClient {
    return new MeliClient(credentials)
  }

  private getUserId(credentials: Credentials): string {
    const userId = credentials.extra?.['userId'] as string | undefined
    if (!userId) {
      throw new Error(
        'Mercado Libre adapter requires userId in credentials.extra — ' +
          'this is set automatically during OAuth2 token exchange.',
      )
    }
    return userId
  }

  // ── Products (Items API) ──────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const client = this.clientFor(credentials)
    const userId = this.getUserId(credentials)
    // Offset/limit paging with `paging.total` in the response; `limit` tops
    // out at 100. The router's `page` becomes the offset at the size sent.
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, ITEMS_SEARCH_MAX_LIMIT)
    const offset = pageOffset(params, limit)
    const qp: Record<string, unknown> = { limit, offset }
    const query = params['query'] as string | undefined
    if (query) qp['q'] = query

    // ML search returns item IDs, not full items
    const res = await client.get<RawSearchEnvelope>(
      `/users/${encodeURIComponent(userId)}/items/search`,
      qp,
    )
    const ids = res.results ?? []
    // hasMore comes from the search page, not from the rows that survive the
    // multiget: an item the multiget fails (a {code: 404} entry) would
    // otherwise make a full page look short and end a sync early.
    reportOffsetPage(params, res.paging, offset, ids.length, limit)
    if (ids.length === 0) return []

    // Fetch full item details using multi-get, at most 20 ids per call.
    const batches: string[][] = []
    for (let i = 0; i < ids.length; i += ITEMS_MULTIGET_MAX_IDS) {
      batches.push(ids.slice(i, i + ITEMS_MULTIGET_MAX_IDS))
    }
    const responses = await Promise.all(
      batches.map((batch) => client.get<RawMeliItem[]>(`${ITEMS_BASE}`, { ids: batch.join(',') })),
    )
    // ML multi-get returns [{code, body}] — handle both formats
    const normalized = responses.flatMap((items) =>
      Array.isArray(items)
        ? items.map((item) => {
            const body = (item as Record<string, unknown>)['body'] as RawMeliItem | undefined
            return body ?? (item as RawMeliItem)
          })
        : [],
    )
    return normalized.filter((item) => item.id).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.clientFor(credentials).get<RawMeliItem>(
      `${ITEMS_BASE}/${encodeURIComponent(id)}`,
    )
    return transformProduct(res)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const body = untransformProduct(data)
    const res = await this.clientFor(credentials).post<RawMeliItem>(ITEMS_BASE, body)
    return transformProduct(res)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const body = untransformProduct(data)
    await this.clientFor(credentials).put<RawMeliItem>(
      `${ITEMS_BASE}/${encodeURIComponent(id)}`,
      body,
    )
    return this.getProduct(credentials, id)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    // ML doesn't support true deletion — close the listing instead
    await this.clientFor(credentials).put<unknown>(`${ITEMS_BASE}/${encodeURIComponent(id)}`, {
      status: 'closed',
    })
  }

  // ── Inventory (Items API — available_quantity on item) ─────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    // Re-use product listing to get inventory levels
    const products = await this.listProducts(credentials, params)
    return products.map((p) => {
      const raw = p.metadata as unknown as RawMeliItem
      return transformInventoryLevel(raw)
    })
  }

  async getInventoryLevel(credentials: Credentials, id: string): Promise<InventoryLevel> {
    // Canonical id is `${itemId}:meli-default`; extract the item ID.
    const itemId = id.includes(':') ? id.split(':')[0]! : id
    const res = await this.clientFor(credentials).get<RawMeliItem>(
      `${ITEMS_BASE}/${encodeURIComponent(itemId)}`,
    )
    return transformInventoryLevel(res)
  }

  async adjustInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; delta: number },
  ): Promise<InventoryLevel> {
    const itemId = data.variantId
    const client = this.clientFor(credentials)
    // Read current, apply delta, write back.
    const current = await client.get<RawMeliItem>(`${ITEMS_BASE}/${encodeURIComponent(itemId)}`)
    const currentQty = current.available_quantity ?? 0
    const newQty = Math.max(0, currentQty + data.delta)
    await client.put<unknown>(`${ITEMS_BASE}/${encodeURIComponent(itemId)}`, {
      available_quantity: newQty,
    })
    return this.getInventoryLevel(credentials, itemId)
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const itemId = data.variantId
    await this.clientFor(credentials).put<unknown>(`${ITEMS_BASE}/${encodeURIComponent(itemId)}`, {
      available_quantity: data.available,
    })
    return this.getInventoryLevel(credentials, itemId)
  }

  // ── Orders (Orders API) ──────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = this.clientFor(credentials)
    const userId = this.getUserId(credentials)
    // Offset/limit paging with `paging.total`; no documented maximum limit,
    // so ask for no more than the 50 the docs show served (SEARCH_SAFE_LIMIT).
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, SEARCH_SAFE_LIMIT)
    const offset = pageOffset(params, limit)
    const qp: Record<string, unknown> = {
      seller: userId,
      limit,
      offset,
      sort: 'date_desc',
    }
    const status = params['status'] as string | undefined
    if (status) qp['order.status'] = status

    const res = await client.get<RawOrdersSearchEnvelope>(ORDERS_BASE, qp)
    const rows = res.results ?? []
    reportOffsetPage(params, res.paging, offset, rows.length, limit)
    return rows.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const res = await this.clientFor(credentials).get<RawMeliOrder>(
      `/orders/${encodeURIComponent(id)}`,
    )
    return transformOrder(res)
  }

  // ── Fulfillments (Shipments API) ────────────────────────────────────────

  async listFulfillments(credentials: Credentials, params: QueryParams): Promise<Fulfillment[]> {
    const orderId = (params['orderId'] ?? params['order_id']) as string | undefined
    if (!orderId) {
      throw new Error('Mercado Libre listFulfillments requires `orderId` in query params.')
    }
    // Get the order to find the shipping ID
    const order = await this.clientFor(credentials).get<RawMeliOrder>(
      `/orders/${encodeURIComponent(orderId)}`,
    )
    const shipmentId = order.shipping?.id
    if (!shipmentId) return []

    const shipment = await this.clientFor(credentials).get<RawMeliShipment>(
      `${SHIPMENTS_BASE}/${shipmentId}`,
    )
    shipment.order_id = order.id
    return [transformFulfillment(shipment)]
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const res = await this.clientFor(credentials).get<RawMeliShipment>(
      `${SHIPMENTS_BASE}/${encodeURIComponent(id)}`,
    )
    return transformFulfillment(res)
  }

  // ── Refunds (Payments API) ────────────────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const orderId = (params['orderId'] ?? params['order_id']) as string | undefined
    if (!orderId) {
      throw new Error('Mercado Libre listRefunds requires `orderId` in query params.')
    }
    const order = await this.clientFor(credentials).get<RawMeliOrder>(
      `/orders/${encodeURIComponent(orderId)}`,
    )
    const refundedPayments = (order.payments ?? []).filter(
      (p) => p.status === 'refunded' || p.status === 'cancelled',
    )
    return refundedPayments.map((p) => {
      const raw: RawMeliRefund = {
        orderId: String(order.id),
        paymentId: p.id,
        amount: p.transaction_amount,
        currency_id: p.currency_id,
        date_created: p.date_created,
        status: p.status,
      }
      return transformRefund(raw)
    })
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    // Refund id is `${orderId}:${paymentId}:refund`. Extract orderId.
    const parts = id.split(':')
    const orderId = parts[0]
    if (!orderId) {
      throw new Error('Mercado Libre refund id must contain an orderId')
    }
    const refunds = await this.listRefunds(credentials, { orderId } as QueryParams)
    const found = refunds.find((r) => r.id === id)
    if (!found) {
      throw new Error(`Mercado Libre getRefund: no refund found matching id '${id}'`)
    }
    return found
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const orderId = data.orderId
    if (!orderId) {
      throw new Error('Mercado Libre createRefund requires `orderId`.')
    }
    // Get the order to find the payment ID
    const order = await this.clientFor(credentials).get<RawMeliOrder>(
      `/orders/${encodeURIComponent(orderId)}`,
    )
    const payment = order.payments?.[0]
    if (!payment) {
      throw new Error(`Mercado Libre createRefund: no payment found for order '${orderId}'`)
    }
    const body = untransformRefund(data)
    const res = await this.clientFor(credentials).post<Record<string, unknown>>(
      `/v1/payments/${payment.id}/refunds`,
      body,
    )
    const refundId = `${orderId}:${payment.id}:refund`
    return {
      id: refundId,
      orderId,
      amount: data.amount
        ? { amount: data.amount.amount, currency: data.amount.currency }
        : undefined,
      reason: data.reason,
      note: data.note,
      processedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      metadata: res,
    }
  }

  // ── Transactions (Payments on orders) ─────────────────────────────────────

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const orderId = (params['orderId'] ?? params['order_id']) as string | undefined
    if (!orderId) {
      throw new Error('Mercado Libre listTransactions requires `orderId` in query params.')
    }
    const order = await this.clientFor(credentials).get<RawMeliOrder>(
      `/orders/${encodeURIComponent(orderId)}`,
    )
    return (order.payments ?? []).map((p) => {
      const raw: RawMeliPayment = { ...p, order_id: order.id }
      return transformTransaction(raw)
    })
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    // Get the payment directly
    const res = await this.clientFor(credentials).get<RawMeliPayment>(
      `/v1/payments/${encodeURIComponent(id)}`,
    )
    return transformTransaction(res)
  }

  // ── Collections (Categories API) ──────────────────────────────────────────
  // ML categories are platform-managed (read-only). We expose them as
  // canonical Collections so consumers can inspect the taxonomy. Sellers
  // cannot create/update/delete categories.

  /**
   * Helper: resolve the ML site_id for the authenticated user.
   * The site_id is encoded in every item ID (e.g. "MLA123" → "MLA"), but the
   * most reliable source is GET /users/{userId} which returns the `site_id`
   * field directly.
   */
  private async getSiteId(credentials: Credentials): Promise<string> {
    const userId = this.getUserId(credentials)
    const user = await this.clientFor(credentials).get<Record<string, unknown>>(
      `${USERS_BASE}/${encodeURIComponent(userId)}`,
    )
    const siteId = user['site_id'] as string | undefined
    if (!siteId) {
      throw new Error(
        'Mercado Libre listCollections: could not determine site_id from user profile.',
      )
    }
    return siteId
  }

  async listCollections(credentials: Credentials, params: QueryParams): Promise<Collection[]> {
    const siteId = await this.getSiteId(credentials)
    // GET /sites/{siteId}/categories returns a flat array of top-level category refs.
    const refs = await this.clientFor(credentials).get<RawMeliCategoryRef[]>(
      `/sites/${encodeURIComponent(siteId)}/categories`,
    )
    if (!Array.isArray(refs)) return []
    const limit = (params.limit as number | undefined) ?? DEFAULT_PAGE_SIZE
    const offset = (params['offset'] as number | undefined) ?? 0
    const page = refs.slice(offset, offset + limit)
    // Fetch full category details for each ref.
    const categories = await Promise.all(
      page.map((ref) =>
        this.clientFor(credentials).get<RawMeliCategory>(
          `${CATEGORIES_BASE}/${encodeURIComponent(ref.id)}`,
        ),
      ),
    )
    return categories.map(transformCollection)
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const res = await this.clientFor(credentials).get<RawMeliCategory>(
      `${CATEGORIES_BASE}/${encodeURIComponent(id)}`,
    )
    return transformCollection(res)
  }

  // ── Customers (Customer Data Access API) ──────────────────────────────────
  // Requires ML CDA certification for the seller + integrator.
  // Endpoint: GET /shops/cda/customers?buyer_id= (getCustomer only)

  /**
   * Refused before any request. GET /shops/cda/customers
   * (https://developers.mercadolibre.com.ar/en_us/customer-data-access) returns
   * ORDERS, not customers: "Answer with the orders registered by the buyer and
   * his information.", and paging.total is "Total orders resulting from the
   * search." A buyer therefore repeats once per order (the page's own example
   * returns buyer 780777832 on orders 4697463433 and 4697450495), so no page of
   * it is a page of customers. The unfiltered query also fails without a date
   * range ("The date range must be sent."), and the page names no retention
   * limit that could bound one.
   */
  async listCustomers(_credentials: Credentials, _params: QueryParams): Promise<Customer[]> {
    throw Object.assign(
      new Error(
        'Mercado Libre cannot list customers: GET /shops/cda/customers returns "the orders ' +
          'registered by the buyer", one row per order, so a buyer repeats across rows, and ' +
          'it requires a date range ("The date range must be sent."). ' +
          'Read one buyer with getCustomer instead.',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    // Filter by buyer_id — returns a list; take the first match.
    const res = await this.clientFor(credentials).get<RawMeliCdaEnvelope>('/shops/cda/customers', {
      buyer_id: id,
    })
    const first = (res.results ?? [])[0]
    if (!first) {
      throw new Error(`Mercado Libre getCustomer: no customer found with buyer_id '${id}'`)
    }
    return transformCustomer(first)
  }

  // ── Discounts (Seller Promotions API) ────────────────────────────────────
  // Endpoint: GET /seller-promotions/users/{userId}?app_version=v2
  //           GET /seller-promotions/promotions/{promotionId}

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const userId = this.getUserId(credentials)
    // The response carries `paging: { offset, limit, total }`, so the general
    // limit/offset rule applies; no maximum is documented for this endpoint,
    // so ask for no more than the 50 its example echoes (SEARCH_SAFE_LIMIT).
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, SEARCH_SAFE_LIMIT)
    const offset = pageOffset(params, limit)
    const qp: Record<string, unknown> = { app_version: 'v2', limit, offset }
    const status = params['status'] as string | undefined
    if (status) qp['status'] = status

    const res = await this.clientFor(credentials).get<RawMeliPromotionListEnvelope>(
      `/seller-promotions/users/${encodeURIComponent(userId)}`,
      qp,
    )
    const rows = res.results ?? []
    reportOffsetPage(params, res.paging, offset, rows.length, limit)
    return rows.map(transformDiscount)
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const res = await this.clientFor(credentials).get<RawMeliPromotion>(
      `/seller-promotions/promotions/${encodeURIComponent(id)}`,
    )
    return transformDiscount(res)
  }
}
