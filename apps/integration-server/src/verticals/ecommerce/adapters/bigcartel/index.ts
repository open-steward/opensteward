import { simpleApiKey } from '@opensteward/shared'
/**
 * Big Cartel adapter for the ecommerce vertical.
 *
 * Maps the Big Cartel REST API (`https://api.bigcartel.com/v1/`) to the
 * canonical ecommerce resources. Big Cartel is a craft/maker marketplace
 * with a very simple data model:
 *
 *  - Products (with inline images, options, and categories)
 *  - Categories (simple name-based groupings)
 *  - Orders (read-only with limited update support)
 *  - Discounts (promotional codes — full CRUD)
 *  - Shipments (fulfillment tracking — full CRUD)
 *  - Transactions (embedded within order responses — derived, read-only)
 *
 * Notable limitations:
 *  - No separate variant/SKU resource (options are product-level only)
 *  - No dedicated inventory endpoint
 *  - No refund endpoint
 *  - No customer resource (customer data only embedded in orders)
 *  - No location resource
 *  - No native webhook support
 *  - Orders are largely read-only
 *
 * Auth: API key in Authorization header. Account ID is required for
 * scoping requests.
 *
 * Docs: https://developers.bigcartel.com/
 */

// ── Resource coverage ──────────────────────────────────────────────────────
// Unavailable: customer   — no dedicated customer endpoint; buyer data is embedded in orders only
// Unavailable: inventory  — no inventory level endpoint in the Big Cartel API
// Unavailable: location   — no location concept in Big Cartel
// Unavailable: refund     — no refund endpoint in the Big Cartel API

import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Discount } from '../../schema/discount'
import type { Transaction } from '../../schema/transaction'
import type { WebhookEvent } from '../../schema/webhook'

import { buildAuthUrl, exchangeCode as bcExchangeCode } from './auth'
import { BigCartelClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import {
  verifyBigCartelWebhook,
  parseBigCartelWebhookEvents,
} from './webhook'

import {
  transformProduct,
  untransformProduct,
  type RawBigCartelProduct,
} from './transform/product'
import {
  transformCollection,
  untransformCollection,
  type RawBigCartelCategory,
} from './transform/collection'
import {
  transformOrder,
  untransformOrder,
  type RawBigCartelOrder,
} from './transform/order'
import {
  transformDiscount,
  untransformDiscount,
  type RawBigCartelDiscount,
} from './transform/discount'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawBigCartelShipment,
} from './transform/fulfillment'
import {
  transformTransaction,
  type RawBigCartelTransaction,
} from './transform/transaction'

export interface BigCartelAdapterConfig {
  /** API key (optional — may come from per-connection credentials instead). */
  apiKey?: string
  /** Big Cartel account ID / subdomain. */
  accountId?: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class BigCartelAdapter implements EcommerceAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'bigcartel'
  readonly version = '0.1.0'
  /** Honours `params.search`; see AdapterCapabilities. Declared so the
   *  router can refuse the parameter on adapters that would drop it. */
  readonly capabilities = { search: true }

  private configApiKey: string | undefined
  private configAccountId: string | undefined

  constructor(config: BigCartelAdapterConfig = {}) {
    this.configApiKey = config.apiKey
    this.configAccountId = config.accountId
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return buildAuthUrl()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return bcExchangeCode()
  }

  /**
   * Big Cartel API keys do not expire and are not rotated, so
   * `refreshCredentials` is a no-op.
   */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  verifyWebhook(
    payload: Buffer,
    headers: Record<string, string>,
    secret: string,
  ): boolean {
    return verifyBigCartelWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    const topic =
      (payload['__topic'] as string | undefined) ??
      (payload['topic'] as string | undefined)
    return parseBigCartelWebhookEvents(payload, topic)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): BigCartelClient {
    const apiKey =
      (credentials.accessToken && credentials.accessToken !== 'api-key'
        ? credentials.accessToken
        : undefined) ?? this.configApiKey
    const accountId =
      (credentials.extra?.['accountId'] as string | undefined) ??
      this.configAccountId

    if (!apiKey || !accountId) {
      throw new Error(
        'Big Cartel adapter is missing apiKey/accountId — ' +
          'either configure them in apps/integration-server/config/config.yml under adapters.bigcartel, ' +
          'or POST them to /v1/connections with credentials: {apiKey, accountId}.',
      )
    }

    const mergedCreds: Credentials = {
      ...credentials,
      accessToken: apiKey,
      extra: { ...credentials.extra, accountId },
    }
    return new BigCartelClient(mergedCreds)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      per_page: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    if (params.page != null) out['page'] = params.page
    if (params.search) out['search'] = params.search
    return out
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const client = this.clientFor(credentials)
    const accountId = client.getAccountId()
    const res = await client.listWithPage<RawBigCartelProduct>(
      `accounts/${accountId}/products`,
      this.listParams(params),
    )
    return res.items.map((p) => transformProduct(p))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const client = this.clientFor(credentials)
    const accountId = client.getAccountId()
    const res = await client.get<{ data: RawBigCartelProduct }>(
      `accounts/${accountId}/products/${id}`,
    )
    return transformProduct(res.data)
  }

  async createProduct(
    credentials: Credentials,
    data: Partial<Product>,
  ): Promise<Product> {
    const client = this.clientFor(credentials)
    const accountId = client.getAccountId()
    const res = await client.post<{ data: RawBigCartelProduct }>(
      `accounts/${accountId}/products`,
      untransformProduct(data),
    )
    return transformProduct(res.data)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const client = this.clientFor(credentials)
    const accountId = client.getAccountId()
    const res = await client.put<{ data: RawBigCartelProduct }>(
      `accounts/${accountId}/products/${id}`,
      untransformProduct(data),
    )
    return transformProduct(res.data)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    const client = this.clientFor(credentials)
    const accountId = client.getAccountId()
    await client.delete(`accounts/${accountId}/products/${id}`)
  }

  // ── Collections (Categories) ──────────────────────────────────────────────

  async listCollections(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Collection[]> {
    const client = this.clientFor(credentials)
    const accountId = client.getAccountId()
    const res = await client.listWithPage<RawBigCartelCategory>(
      `accounts/${accountId}/categories`,
      this.listParams(params),
    )
    return res.items.map((c) => transformCollection(c))
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const client = this.clientFor(credentials)
    const accountId = client.getAccountId()
    const res = await client.get<{ data: RawBigCartelCategory }>(
      `accounts/${accountId}/categories/${id}`,
    )
    return transformCollection(res.data)
  }

  async createCollection(
    credentials: Credentials,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const client = this.clientFor(credentials)
    const accountId = client.getAccountId()
    const res = await client.post<{ data: RawBigCartelCategory }>(
      `accounts/${accountId}/categories`,
      untransformCollection(data),
    )
    return transformCollection(res.data)
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const client = this.clientFor(credentials)
    const accountId = client.getAccountId()
    const res = await client.put<{ data: RawBigCartelCategory }>(
      `accounts/${accountId}/categories/${id}`,
      untransformCollection(data),
    )
    return transformCollection(res.data)
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    const client = this.clientFor(credentials)
    const accountId = client.getAccountId()
    await client.delete(`accounts/${accountId}/categories/${id}`)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = this.clientFor(credentials)
    const accountId = client.getAccountId()
    const res = await client.listWithPage<RawBigCartelOrder>(
      `accounts/${accountId}/orders`,
      this.listParams(params),
    )
    return res.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = this.clientFor(credentials)
    const accountId = client.getAccountId()
    const res = await client.get<{ data: RawBigCartelOrder }>(
      `accounts/${accountId}/orders/${id}`,
    )
    return transformOrder(res.data)
  }

  async updateOrder(
    credentials: Credentials,
    id: string,
    data: Partial<Order>,
  ): Promise<Order> {
    const client = this.clientFor(credentials)
    const accountId = client.getAccountId()
    const res = await client.put<{ data: RawBigCartelOrder }>(
      `accounts/${accountId}/orders/${id}`,
      untransformOrder(data),
    )
    return transformOrder(res.data)
  }

  async cancelOrder(
    credentials: Credentials,
    id: string,
    _data?: { reason?: string },
  ): Promise<Order> {
    const client = this.clientFor(credentials)
    const accountId = client.getAccountId()
    const res = await client.put<{ data: RawBigCartelOrder }>(
      `accounts/${accountId}/orders/${id}`,
      { data: { type: 'orders', attributes: { status: 'cancelled' } } },
    )
    return transformOrder(res.data)
  }

  // ── Discounts ─────────────────────────────────────────────────────────────

  async listDiscounts(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Discount[]> {
    const client = this.clientFor(credentials)
    const accountId = client.getAccountId()
    const res = await client.listWithPage<RawBigCartelDiscount>(
      `accounts/${accountId}/discounts`,
      this.listParams(params),
    )
    return res.items.map(transformDiscount)
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const client = this.clientFor(credentials)
    const accountId = client.getAccountId()
    const res = await client.get<{ data: RawBigCartelDiscount }>(
      `accounts/${accountId}/discounts/${id}`,
    )
    return transformDiscount(res.data)
  }

  async createDiscount(
    credentials: Credentials,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const client = this.clientFor(credentials)
    const accountId = client.getAccountId()
    const res = await client.post<{ data: RawBigCartelDiscount }>(
      `accounts/${accountId}/discounts`,
      untransformDiscount(data),
    )
    return transformDiscount(res.data)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const client = this.clientFor(credentials)
    const accountId = client.getAccountId()
    const res = await client.put<{ data: RawBigCartelDiscount }>(
      `accounts/${accountId}/discounts/${id}`,
      untransformDiscount(data),
    )
    return transformDiscount(res.data)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    const client = this.clientFor(credentials)
    const accountId = client.getAccountId()
    await client.delete(`accounts/${accountId}/discounts/${id}`)
  }

  // ── Fulfillments (Shipments) ──────────────────────────────────────────────

  async listFulfillments(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Fulfillment[]> {
    const client = this.clientFor(credentials)
    const accountId = client.getAccountId()
    const res = await client.listWithPage<RawBigCartelShipment>(
      `accounts/${accountId}/shipments`,
      this.listParams(params),
    )
    return res.items.map(transformFulfillment)
  }

  async getFulfillment(
    credentials: Credentials,
    id: string,
  ): Promise<Fulfillment> {
    const client = this.clientFor(credentials)
    const accountId = client.getAccountId()
    const res = await client.get<{ data: RawBigCartelShipment }>(
      `accounts/${accountId}/shipments/${id}`,
    )
    return transformFulfillment(res.data)
  }

  async createFulfillment(
    credentials: Credentials,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    const client = this.clientFor(credentials)
    const accountId = client.getAccountId()
    const res = await client.post<{ data: RawBigCartelShipment }>(
      `accounts/${accountId}/shipments`,
      untransformFulfillment(data),
    )
    return transformFulfillment(res.data)
  }

  async updateFulfillment(
    credentials: Credentials,
    id: string,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    const client = this.clientFor(credentials)
    const accountId = client.getAccountId()
    const res = await client.put<{ data: RawBigCartelShipment }>(
      `accounts/${accountId}/shipments/${id}`,
      untransformFulfillment(data),
    )
    return transformFulfillment(res.data)
  }

  async cancelFulfillment(
    credentials: Credentials,
    id: string,
  ): Promise<Fulfillment> {
    const client = this.clientFor(credentials)
    const accountId = client.getAccountId()
    const res = await client.put<{ data: RawBigCartelShipment }>(
      `accounts/${accountId}/shipments/${id}`,
      { data: { type: 'shipments', attributes: { status: 'cancelled' } } },
    )
    return transformFulfillment(res.data)
  }

  // ── Transactions (derived from orders) ────────────────────────────────────

  /**
   * Transactions are not available via a standalone endpoint. They are
   * embedded in order responses under the `included` array (JSON:API style).
   * We fetch the first page of orders and extract transactions from each.
   */
  async listTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Transaction[]> {
    const client = this.clientFor(credentials)
    const accountId = client.getAccountId()
    const res = await client.listWithPage<RawBigCartelOrder>(
      `accounts/${accountId}/orders`,
      this.listParams(params),
    )
    const transactions: Transaction[] = []
    for (const order of res.items) {
      const orderId = String(order.id)
      const currency = (order.attributes as Record<string, unknown>)?.['currency'] as string | undefined
      const included = (order as unknown as { included?: unknown[] }).included ?? []
      for (const inc of included) {
        const item = inc as RawBigCartelTransaction
        if (
          typeof item.type === 'string' &&
          item.type.startsWith('order_transactions')
        ) {
          transactions.push(transformTransaction(item, orderId, currency ?? 'USD'))
        }
      }
    }
    return transactions
  }

  async getTransaction(
    credentials: Credentials,
    id: string,
  ): Promise<Transaction> {
    // Big Cartel has no standalone transaction endpoint. We must scan orders.
    // Fetch the most recent orders page and search for the transaction id.
    const client = this.clientFor(credentials)
    const accountId = client.getAccountId()
    const res = await client.listWithPage<RawBigCartelOrder>(
      `accounts/${accountId}/orders`,
      { 'page[size]': DEFAULT_PAGE_SIZE, 'page[number]': 1 },
    )
    for (const order of res.items) {
      const orderId = String(order.id)
      const currency = (order.attributes as Record<string, unknown>)?.['currency'] as string | undefined
      const included = (order as unknown as { included?: unknown[] }).included ?? []
      for (const inc of included) {
        const item = inc as RawBigCartelTransaction
        if (
          typeof item.type === 'string' &&
          item.type.startsWith('order_transactions') &&
          String(item.id) === id
        ) {
          return transformTransaction(item, orderId, currency ?? 'USD')
        }
      }
    }
    throw new Error(`Transaction ${id} not found in recent orders`)
  }
}
