/**
 * Sapo adapter for the ecommerce vertical.
 *
 * Maps the Sapo Admin REST API (https://{store}.mysapo.net/admin) to the
 * canonical ecommerce resources.
 *
 * Supported resources:
 *  - Products (CRUD) + Variants (list/get/update)
 *  - Collections — custom (CRUD) + smart (read-only)
 *  - Customers (CRUD)
 *  - Orders (CRUD + cancel)
 *  - Fulfillments (list/get/create/update/cancel) — order-scoped
 *  - Refunds (list/get/create) — order-scoped
 *  - Transactions (list/get/create) — order-scoped
 *  - Discounts — price_rules + discount_codes (CRUD)
 *
 * NOT supported (no dedicated REST endpoints in Sapo):
 *  - InventoryLevels (inventory is inline on variants via `inventory_quantity`)
 *  - Locations
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: inventory — Sapo REST API has no dedicated inventory level
 *   endpoints; stock is tracked inline on product variants via
 *   inventory_quantity only, with no multi-location support.
 * Unavailable: location — Sapo REST API does not expose a locations resource;
 *   no /admin/locations.json or equivalent endpoint is documented.
 *
 * Auth:
 *  - OAuth app mode: `X-Sapo-Access-Token` header
 *  - Private app mode: HTTP Basic auth (apiKey:apiSecret)
 *    (supply `credentials.extra.apiSecret`)
 *
 * Pagination: page/limit (default 50, max 250).
 *
 * Docs: https://support.sapo.vn/gioi-thieu-api
 */

import axios from 'axios'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Customer } from '../../schema/customer'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Refund } from '../../schema/refund'
import type { Transaction } from '../../schema/transaction'
import type { Discount } from '../../schema/discount'
import type { WebhookEvent } from '../../schema/webhook'

import { buildAuthUrl, exchangeCode as sapoExchangeCode } from './auth'
import { SapoClient } from './client'
import { DEFAULT_PAGE_SIZE, DEFAULT_SCOPES } from './constants'

import {
  transformProduct,
  untransformProduct,
  transformVariant,
  untransformVariant,
  type RawSapoProduct,
  type RawSapoVariant,
} from './transform/product'
import {
  transformCollection,
  untransformCollection,
  type RawSapoCollection,
} from './transform/collection'
import {
  transformCustomer,
  untransformCustomer,
  type RawSapoCustomer,
} from './transform/customer'
import {
  transformOrder,
  untransformOrder,
  type RawSapoOrder,
} from './transform/order'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawSapoFulfillment,
} from './transform/fulfillment'
import {
  transformRefund,
  untransformRefund,
  type RawSapoRefund,
} from './transform/refund'
import {
  transformTransaction,
  untransformTransaction,
  type RawSapoTransaction,
} from './transform/transaction'
import {
  transformDiscount,
  untransformDiscount,
  type RawSapoPriceRule,
  type RawSapoDiscountCode,
} from './transform/discount'

export interface SapoAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  /**
   * Store subdomain, e.g. `mystore` (not `mystore.mysapo.net`).
   */
  store: string
  scopes?: string[]
}

export class SapoAdapter implements EcommerceAdapter {
  readonly platform = 'sapo'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private store: string
  private scopes: string[]

  constructor(config: SapoAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.store = config.store
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(
      this.store,
      this.clientId,
      this.redirectUri,
      overrideScopes ?? this.scopes,
      state,
    )
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return sapoExchangeCode(this.store, code, this.clientId, this.clientSecret)
  }

  /**
   * Sapo offline access tokens are long-lived and do not rotate. The shared
   * `isTokenExpired` helper treats credentials without `expiresAt` as
   * non-expiring, so returning them unchanged here is correct.
   */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────
  // Sapo does not document HMAC signature verification for webhooks, so
  // `verifyWebhook` is not implemented (the registry will treat it as a 501).
  // `parseWebhookEvents` maps the Sapo topic format ("resource/action") to the
  // canonical shape.

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    const topic =
      (payload['__topic'] as string | undefined) ??
      (payload['topic'] as string | undefined) ??
      ''

    const RESOURCE_MAP: Record<string, WebhookEvent['resourceType']> = {
      products: 'products',
      collections: 'collections',
      orders: 'orders',
      customers: 'customers',
      fulfillments: 'fulfillments',
      refunds: 'refunds',
      order_transactions: 'transactions',
    }
    const ACTION_MAP: Record<string, WebhookEvent['action']> = {
      create: 'created',
      created: 'created',
      update: 'updated',
      updated: 'updated',
      delete: 'deleted',
      deleted: 'deleted',
    }

    const [group = '', verb = ''] = topic.toLowerCase().split('/')
    const resourceType = RESOURCE_MAP[group] ?? 'unknown'
    const action = ACTION_MAP[verb] ?? 'unknown'
    const rawId = payload['id']
    const resourceId = rawId == null ? '' : String(rawId)

    return [
      {
        platform: 'sapo',
        type: `${resourceType}.${action}`,
        resourceType,
        action,
        resourceId,
        payload,
      },
    ]
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): SapoClient {
    return new SapoClient(credentials, this.store)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
      page: (params['page'] as number | undefined) ?? 1,
    }
    if (params.updatedAfter) {
      out.modified_on_min = params.updatedAfter.toISOString()
    }
    if (params['since_id']) {
      out.since_id = params['since_id']
    }
    return out
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const res = await this.client(credentials).listWithPage<RawSapoProduct>(
      'products.json',
      'products',
      this.listParams(params),
    )
    return res.items.map((p) => transformProduct(p))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<{ product: RawSapoProduct }>(
      `products/${id}.json`,
    )
    return transformProduct(res.product)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const res = await this.client(credentials).post<{ product: RawSapoProduct }>(
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
    const res = await this.client(credentials).put<{ product: RawSapoProduct }>(
      `products/${id}.json`,
      { product: { id, ...untransformProduct(data) } },
    )
    return transformProduct(res.product)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`products/${id}.json`)
  }

  // ── Variants ──────────────────────────────────────────────────────────────

  async listVariants(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<ProductVariant[]> {
    const productId = params['productId'] ?? params['product_id']
    const client = this.client(credentials)
    if (productId) {
      const res = await client.get<{ variants: RawSapoVariant[] }>(
        `products/${String(productId)}/variants.json`,
        this.listParams(params),
      )
      return (res.variants ?? []).map((v) => transformVariant(v))
    }
    // Fallback: fetch products and flatten variants.
    const productsRes = await client.listWithPage<RawSapoProduct>(
      'products.json',
      'products',
      this.listParams(params),
    )
    return productsRes.items.flatMap((p) =>
      (p.variants ?? []).map((v) => transformVariant(v, 'VND', p.options)),
    )
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    const res = await this.client(credentials).get<{ variant: RawSapoVariant }>(
      `variants/${id}.json`,
    )
    return transformVariant(res.variant)
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const res = await this.client(credentials).put<{ variant: RawSapoVariant }>(
      `variants/${id}.json`,
      { variant: { id, ...untransformVariant(data) } },
    )
    return transformVariant(res.variant)
  }

  // ── Collections ───────────────────────────────────────────────────────────

  async listCollections(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Collection[]> {
    const client = this.client(credentials)
    const [custom, smart] = await Promise.all([
      client.listWithPage<RawSapoCollection>(
        'custom_collections.json',
        'custom_collections',
        this.listParams(params),
      ),
      client.listWithPage<RawSapoCollection>(
        'smart_collections.json',
        'smart_collections',
        this.listParams(params),
      ),
    ])
    return [
      ...custom.items.map((c) => transformCollection(c, 'MANUAL')),
      ...smart.items.map((c) => transformCollection(c, 'SMART')),
    ]
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const client = this.client(credentials)
    try {
      const res = await client.get<{ custom_collection: RawSapoCollection }>(
        `custom_collections/${id}.json`,
      )
      return transformCollection(res.custom_collection, 'MANUAL')
    } catch (err) {
      // Only fall back to smart_collections on a 404 — propagate auth/server/network errors.
      if (!axios.isAxiosError(err) || err.response?.status !== 404) throw err
      const res = await client.get<{ smart_collection: RawSapoCollection }>(
        `smart_collections/${id}.json`,
      )
      return transformCollection(res.smart_collection, 'SMART')
    }
  }

  async createCollection(
    credentials: Credentials,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const res = await this.client(credentials).post<{
      custom_collection: RawSapoCollection
    }>('custom_collections.json', { custom_collection: untransformCollection(data) })
    return transformCollection(res.custom_collection, 'MANUAL')
  }

  async updateCollection(
    credentials: Credentials,
    id: string,
    data: Partial<Collection>,
  ): Promise<Collection> {
    const res = await this.client(credentials).put<{
      custom_collection: RawSapoCollection
    }>(`custom_collections/${id}.json`, {
      custom_collection: { id, ...untransformCollection(data) },
    })
    return transformCollection(res.custom_collection, 'MANUAL')
  }

  async deleteCollection(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`custom_collections/${id}.json`)
  }

  // ── Customers ─────────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const res = await this.client(credentials).listWithPage<RawSapoCustomer>(
      'customers.json',
      'customers',
      this.listParams(params),
    )
    return res.items.map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).get<{ customer: RawSapoCustomer }>(
      `customers/${id}.json`,
    )
    return transformCustomer(res.customer)
  }

  async createCustomer(
    credentials: Credentials,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const res = await this.client(credentials).post<{ customer: RawSapoCustomer }>(
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
    const res = await this.client(credentials).put<{ customer: RawSapoCustomer }>(
      `customers/${id}.json`,
      { customer: { id, ...untransformCustomer(data) } },
    )
    return transformCustomer(res.customer)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`customers/${id}.json`)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const res = await this.client(credentials).listWithPage<RawSapoOrder>(
      'orders.json',
      'orders',
      { ...this.listParams(params), status: 'any' },
    )
    return res.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const res = await this.client(credentials).get<{ order: RawSapoOrder }>(
      `orders/${id}.json`,
    )
    return transformOrder(res.order)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const res = await this.client(credentials).post<{ order: RawSapoOrder }>(
      'orders.json',
      { order: untransformOrder(data) },
    )
    return transformOrder(res.order)
  }

  async updateOrder(
    credentials: Credentials,
    id: string,
    data: Partial<Order>,
  ): Promise<Order> {
    const res = await this.client(credentials).put<{ order: RawSapoOrder }>(
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
    const res = await this.client(credentials).post<{ order: RawSapoOrder }>(
      `orders/${id}/cancel.json`,
      data?.reason ? { reason: data.reason } : {},
    )
    return transformOrder(res.order)
  }

  // ── Fulfillments ──────────────────────────────────────────────────────────
  // Sapo fulfillment endpoints are scoped to orders.

  async listFulfillments(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Fulfillment[]> {
    const orderId = params['order_id'] ?? params['orderId']
    if (!orderId) {
      throw new Error('listFulfillments requires `order_id` in query params')
    }
    const res = await this.client(credentials).get<{
      fulfillments: RawSapoFulfillment[]
    }>(
      `orders/${String(orderId)}/fulfillments.json`,
      this.listParams(params),
    )
    return (res.fulfillments ?? []).map(transformFulfillment)
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    // Composite id format: `orderId:fulfillmentId`
    const [orderId, fulfillmentId] = id.split(':')
    if (!orderId || !fulfillmentId) {
      throw new Error('Invalid fulfillment id format: expected `orderId:fulfillmentId`')
    }
    const res = await this.client(credentials).get<{ fulfillment: RawSapoFulfillment }>(
      `orders/${orderId}/fulfillments/${fulfillmentId}.json`,
    )
    return transformFulfillment(res.fulfillment)
  }

  async createFulfillment(
    credentials: Credentials,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    if (!data.orderId) throw new Error('createFulfillment requires orderId')
    const res = await this.client(credentials).post<{ fulfillment: RawSapoFulfillment }>(
      `orders/${data.orderId}/fulfillments.json`,
      { fulfillment: untransformFulfillment(data) },
    )
    return transformFulfillment(res.fulfillment)
  }

  async updateFulfillment(
    credentials: Credentials,
    id: string,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    const [orderId, fulfillmentId] = id.split(':')
    if (!orderId || !fulfillmentId) {
      throw new Error('Invalid fulfillment id format: expected `orderId:fulfillmentId`')
    }
    const res = await this.client(credentials).put<{ fulfillment: RawSapoFulfillment }>(
      `orders/${orderId}/fulfillments/${fulfillmentId}.json`,
      {
        fulfillment: {
          tracking_number: data.trackingNumber,
          tracking_url: data.trackingUrl,
          tracking_company: data.carrier,
          notify_customer: data.notifyCustomer,
        },
      },
    )
    return transformFulfillment(res.fulfillment)
  }

  async cancelFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const [orderId, fulfillmentId] = id.split(':')
    if (!orderId || !fulfillmentId) {
      throw new Error('Invalid fulfillment id format: expected `orderId:fulfillmentId`')
    }
    const res = await this.client(credentials).post<{ fulfillment: RawSapoFulfillment }>(
      `orders/${orderId}/fulfillments/${fulfillmentId}/cancel.json`,
    )
    return transformFulfillment(res.fulfillment)
  }

  // ── Refunds ───────────────────────────────────────────────────────────────
  // Sapo refund endpoints are scoped to orders.

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const orderId = params['order_id'] ?? params['orderId']
    if (!orderId) {
      throw new Error('listRefunds requires `order_id` in query params')
    }
    const res = await this.client(credentials).get<{ refunds: RawSapoRefund[] }>(
      `orders/${String(orderId)}/refunds.json`,
      this.listParams(params),
    )
    return (res.refunds ?? []).map((r) => transformRefund(r))
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    // Composite id format: `orderId:refundId`
    const [orderId, refundId] = id.split(':')
    if (!orderId || !refundId) {
      throw new Error('Invalid refund id format: expected `orderId:refundId`')
    }
    const res = await this.client(credentials).get<{ refund: RawSapoRefund }>(
      `orders/${orderId}/refunds/${refundId}.json`,
    )
    return transformRefund(res.refund)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.orderId) throw new Error('createRefund requires orderId')
    const res = await this.client(credentials).post<{ refund: RawSapoRefund }>(
      `orders/${data.orderId}/refunds.json`,
      { refund: untransformRefund(data) },
    )
    return transformRefund(res.refund)
  }

  // ── Transactions ──────────────────────────────────────────────────────────
  // Sapo transaction endpoints are scoped to orders.

  async listTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Transaction[]> {
    const orderId = params['order_id'] ?? params['orderId']
    if (!orderId) {
      throw new Error('listTransactions requires `order_id` in query params')
    }
    const res = await this.client(credentials).get<{
      transactions: RawSapoTransaction[]
    }>(
      `orders/${String(orderId)}/transactions.json`,
      this.listParams(params),
    )
    return (res.transactions ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    // Composite id format: `orderId:transactionId`
    const [orderId, txId] = id.split(':')
    if (!orderId || !txId) {
      throw new Error('Invalid transaction id format: expected `orderId:transactionId`')
    }
    const res = await this.client(credentials).get<{
      transaction: RawSapoTransaction
    }>(`orders/${orderId}/transactions/${txId}.json`)
    return transformTransaction(res.transaction)
  }

  async createTransaction(
    credentials: Credentials,
    data: Partial<Transaction>,
  ): Promise<Transaction> {
    if (!data.orderId) throw new Error('createTransaction requires orderId')
    const res = await this.client(credentials).post<{
      transaction: RawSapoTransaction
    }>(`orders/${data.orderId}/transactions.json`, {
      transaction: untransformTransaction(data),
    })
    return transformTransaction(res.transaction)
  }

  // ── Discounts ─────────────────────────────────────────────────────────────
  // Sapo uses price_rules + discount_codes (same two-resource pattern as Shopify).

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const client = this.client(credentials)
    const res = await client.listWithPage<RawSapoPriceRule>(
      'price_rules.json',
      'price_rules',
      this.listParams(params),
    )
    const withCodes = await Promise.all(
      res.items.map(async (rule) => {
        try {
          const cr = await client.get<{ discount_codes: RawSapoDiscountCode[] }>(
            `price_rules/${rule.id}/discount_codes.json`,
          )
          return transformDiscount(rule, cr.discount_codes?.[0])
        } catch {
          return transformDiscount(rule)
        }
      }),
    )
    return withCodes
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const client = this.client(credentials)
    const rule = await client.get<{ price_rule: RawSapoPriceRule }>(
      `price_rules/${id}.json`,
    )
    let code: RawSapoDiscountCode | undefined
    try {
      const cr = await client.get<{ discount_codes: RawSapoDiscountCode[] }>(
        `price_rules/${id}/discount_codes.json`,
      )
      code = cr.discount_codes?.[0]
    } catch {
      /* no code */
    }
    return transformDiscount(rule.price_rule, code)
  }

  async createDiscount(
    credentials: Credentials,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const client = this.client(credentials)
    const rule = await client.post<{ price_rule: RawSapoPriceRule }>('price_rules.json', {
      price_rule: untransformDiscount(data),
    })
    let code: RawSapoDiscountCode | undefined
    if (data.code) {
      const cr = await client.post<{ discount_code: RawSapoDiscountCode }>(
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
    const res = await this.client(credentials).put<{ price_rule: RawSapoPriceRule }>(
      `price_rules/${id}.json`,
      { price_rule: { id, ...untransformDiscount(data) } },
    )
    return transformDiscount(res.price_rule)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`price_rules/${id}.json`)
  }
}
