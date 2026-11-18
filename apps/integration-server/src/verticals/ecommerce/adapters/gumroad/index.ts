/**
 * Gumroad adapter for the ecommerce vertical.
 *
 * Maps Gumroad's REST API v2 to the canonical ecommerce resources. Gumroad
 * is a digital creator marketplace — sellers publish digital products
 * (ebooks, courses, software, music) and buyers purchase them directly.
 *
 * Slug: `gumroad` (both directory and platform identifier).
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (20):
 *
 *   Products:     list, get, create, update, delete  (Products API)
 *   Orders:       list, get                          (Sales API)
 *   Customers:    list, get                          (Subscribers API)
 *   Discounts:    list, get, create, update, delete  (Offer Codes API)
 *   Refunds:      list, get                          (derived from Sales API)
 *   Auth:         getAuthUrl, exchangeCode, refreshCredentials
 *   Webhooks:     verifyWebhook, parseWebhookEvents  (Resource subscription pings)
 *
 * Omitted (22) — the registry will return HTTP 501 automatically:
 *
 *   Variants (5)      — digital products don't have purchasable SKU variants.
 *   Locations (2)     — digital-only, no warehouses.
 *   Inventory (4)     — digital products have no stock levels.
 *   Fulfillments (5)  — digital delivery is instant, no fulfillment tracking.
 *   Customer CUD (3)  — subscribers are read-only.
 *   Order CUD (3)     — sellers don't create/update/cancel sales.
 *   Transactions (3)  — no financial transaction resource in Gumroad API.
 *
 * ── Resource coverage ──────────────────────────────────────────────────
 * Unavailable: collection — no collection/category API exists in Gumroad.
 * Unavailable: fulfillment — digital delivery is instant; no fulfillment tracking endpoint.
 * Unavailable: inventory — digital products have no stock levels or inventory endpoint.
 * Unavailable: location — digital-only platform; no warehouse/location endpoint.
 * Unavailable: transaction — no financial transaction resource exposed in the Gumroad API.
 */

import crypto from 'node:crypto'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { connectionScope, cursorPagerKey, pageByRows } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { Order } from '../../schema/order'
import type { Customer } from '../../schema/customer'
import type { Discount } from '../../schema/discount'
import type { Refund } from '../../schema/refund'
import type { WebhookEvent } from '../../schema/webhook'

import {
  buildAuthUrl,
  exchangeCode as gumroadExchangeCode,
  refreshCredentials as gumroadRefreshCredentials,
} from './auth'
import { GumroadClient } from './client'
import {
  transformProduct,
  untransformProduct,
  type RawGumroadProduct,
} from './transform/product'
import {
  transformOrder,
  type RawGumroadSale,
} from './transform/order'
import {
  transformCustomer,
  type RawGumroadSubscriber,
} from './transform/customer'
import {
  transformDiscount,
  type RawGumroadOfferCode,
} from './transform/discount'
import {
  transformRefund,
} from './transform/refund'

export interface GumroadAdapterConfig {
  /** Gumroad application id (client id). Optional — may come from credentials. */
  applicationId?: string
  /** Gumroad application secret (client secret). Optional — may come from credentials. */
  applicationSecret?: string
}

export class GumroadAdapter implements EcommerceAdapter {
  readonly platform = 'gumroad'
  readonly version = '0.1.0'

  private configApplicationId: string | undefined
  private configApplicationSecret: string | undefined

  constructor(config: GumroadAdapterConfig = {}) {
    this.configApplicationId = config.applicationId
    this.configApplicationSecret = config.applicationSecret
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    const applicationId = this.configApplicationId ?? ''
    return buildAuthUrl(applicationId, '', state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    const applicationId = this.configApplicationId
    const applicationSecret = this.configApplicationSecret
    if (!applicationId || !applicationSecret) {
      throw new Error(
        'Gumroad exchangeCode requires applicationId and applicationSecret — ' +
          'configure them in the adapter config or POST credentials with ' +
          'extra.applicationId and extra.applicationSecret.',
      )
    }
    const result = await gumroadExchangeCode(applicationId, applicationSecret, code, redirectUri)
    return {
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      extra: { applicationId, applicationSecret },
    }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return gumroadRefreshCredentials(credentials)
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    const signature = headers['x-gumroad-signature']
    if (!signature) return false
    const expected = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex')
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex'),
    )
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    const resourceName = (payload['resource_name'] as string | undefined) ?? 'unknown'

    let type: string
    let resourceType: 'orders' | 'refunds' | 'customers' | 'unknown'
    let action: 'created' | 'updated' | 'deleted' | 'unknown'

    if (resourceName === 'sale') {
      type = 'order.created'
      resourceType = 'orders'
      action = 'created'
    } else if (resourceName === 'refund') {
      type = 'refund.created'
      resourceType = 'refunds'
      action = 'created'
    } else if (resourceName === 'subscription_updated') {
      type = 'customer.updated'
      resourceType = 'customers'
      action = 'updated'
    } else if (resourceName === 'subscription_ended') {
      type = 'customer.deleted'
      resourceType = 'customers'
      action = 'deleted'
    } else if (resourceName === 'subscription_restarted') {
      type = 'customer.updated'
      resourceType = 'customers'
      action = 'updated'
    } else {
      type = `${resourceName}.unknown`
      resourceType = 'unknown'
      action = 'unknown'
    }

    const resourceId = (payload['sale_id'] as string | undefined)
      ?? (payload['subscription_id'] as string | undefined)
      ?? 'unknown'

    return [{
      platform: this.platform,
      type,
      resourceType,
      action,
      resourceId,
      payload,
    }]
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): GumroadClient {
    return new GumroadClient(credentials)
  }

  // ── Products (Products API) ───────────────────────────────────────────────

  /**
   * `GET /products` pages by an opaque keyset cursor: the response carries
   * `next_page_key`, "Opaque cursor to pass as page_key to fetch the next
   * page", "present when more results follow". No page-size parameter is
   * documented; the server serves a fixed batch (10 in Gumroad's source), so
   * one upstream page is not one caller page and `pageByRows` cuts the
   * caller's rows out of the stream. The caller's limit does not size the
   * upstream page, so it stays out of the key.
   */
  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const client = this.clientFor(credentials)
    const key = cursorPagerKey(connectionScope('gumroad', credentials), 'products', {})
    const { items } = await pageByRows<Product>(key, params, async (cursor) => {
      const data = await client.get<Record<string, unknown>>(
        '/products',
        cursor === undefined ? undefined : { page_key: cursor },
      )
      const products = (data['products'] as RawGumroadProduct[] | undefined) ?? []
      const next = data['next_page_key']
      return {
        items: products.map(transformProduct),
        next: typeof next === 'string' && next !== '' ? next : undefined,
      }
    })
    return items
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const client = this.clientFor(credentials)
    const product = await client.getResource<RawGumroadProduct>(
      `/products/${encodeURIComponent(id)}`,
      'product',
    )
    return transformProduct(product)
  }

  async createProduct(
    credentials: Credentials,
    data: Partial<Product>,
  ): Promise<Product> {
    const client = this.clientFor(credentials)
    const body = untransformProduct(data)
    const res = await client.post<Record<string, unknown>>('/products', body)
    const raw = res['product'] as RawGumroadProduct
    return transformProduct(raw)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const client = this.clientFor(credentials)
    const body = untransformProduct(data)
    const res = await client.put<Record<string, unknown>>(
      `/products/${encodeURIComponent(id)}`,
      body,
    )
    const raw = res['product'] as RawGumroadProduct
    return transformProduct(raw)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(
      `/products/${encodeURIComponent(id)}`,
    )
  }

  // ── Orders (Sales API) ────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = this.clientFor(credentials)
    const page = params.page ?? 1
    const queryParams: Record<string, unknown> = { page }

    // Gumroad sales support before/after date filtering
    if (params.updatedAfter) {
      queryParams['after'] = params.updatedAfter.toISOString().split('T')[0]
    }

    const data = await client.get<Record<string, unknown>>('/sales', queryParams)
    const sales = (data['sales'] as RawGumroadSale[] | undefined) ?? []
    return sales.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = this.clientFor(credentials)
    const sale = await client.getResource<RawGumroadSale>(
      `/sales/${encodeURIComponent(id)}`,
      'sale',
    )
    return transformOrder(sale)
  }

  // ── Customers (Subscribers API) ───────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const productId = params['productId'] ?? params['product_id']
    if (!productId) {
      throw new Error(
        'Gumroad listCustomers requires `productId` in query params — ' +
          'subscribers are scoped to a product.',
      )
    }
    const client = this.clientFor(credentials)
    const subscribers = await client.getResource<RawGumroadSubscriber[]>(
      `/products/${encodeURIComponent(String(productId))}/subscribers`,
      'subscribers',
    )
    return (subscribers ?? []).map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const client = this.clientFor(credentials)
    const subscriber = await client.getResource<RawGumroadSubscriber>(
      `/subscribers/${encodeURIComponent(id)}`,
      'subscriber',
    )
    return transformCustomer(subscriber)
  }

  // ── Discounts (Offer Codes API) ───────────────────────────────────────────
  //
  // Gumroad offer codes are scoped to a product. listDiscounts requires
  // `productId` in params. getDiscount requires `productId` as well since
  // Gumroad's GET endpoint is /products/:product_id/offer_codes/:id.
  // createDiscount, updateDiscount, deleteDiscount also require `productId`.

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const productId = params['productId'] ?? params['product_id']
    if (!productId) {
      throw new Error(
        'Gumroad listDiscounts requires `productId` in query params — ' +
          'offer codes are scoped to a product.',
      )
    }
    const client = this.clientFor(credentials)
    const offerCodes = await client.getResource<RawGumroadOfferCode[]>(
      `/products/${encodeURIComponent(String(productId))}/offer_codes`,
      'offer_codes',
    )
    return (offerCodes ?? []).map((code) =>
      transformDiscount(code, String(productId)),
    )
  }

  async getDiscount(credentials: Credentials, id: string, params?: QueryParams): Promise<Discount> {
    const productId = params?.['productId'] ?? params?.['product_id']
    if (!productId) {
      throw new Error(
        'Gumroad getDiscount requires `productId` in params — ' +
          'offer codes are scoped to a product.',
      )
    }
    const client = this.clientFor(credentials)
    const offerCode = await client.getResource<RawGumroadOfferCode>(
      `/products/${encodeURIComponent(String(productId))}/offer_codes/${encodeURIComponent(id)}`,
      'offer_code',
    )
    return transformDiscount(offerCode, String(productId))
  }

  async createDiscount(
    credentials: Credentials,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const productId =
      (data.productIds?.[0]) ??
      (data.metadata?.['productId'] as string | undefined)
    if (!productId) {
      throw new Error(
        'Gumroad createDiscount requires a productId — ' +
          'pass it in data.productIds[0] or data.metadata.productId.',
      )
    }
    const body: Record<string, unknown> = {
      name: data.code ?? data.title,
    }
    if (data.type === 'PERCENTAGE') {
      body['offer_type'] = 'percent'
      body['amount_off'] = data.value
    } else {
      body['offer_type'] = 'cents'
      body['amount_off'] = data.value
    }
    if (data.usageLimit != null) body['max_purchase_count'] = data.usageLimit
    const client = this.clientFor(credentials)
    const res = await client.post<Record<string, unknown>>(
      `/products/${encodeURIComponent(productId)}/offer_codes`,
      body,
    )
    const raw = res['offer_code'] as RawGumroadOfferCode
    return transformDiscount(raw, productId)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const productId =
      (data.productIds?.[0]) ??
      (data.metadata?.['productId'] as string | undefined)
    if (!productId) {
      throw new Error(
        'Gumroad updateDiscount requires a productId — ' +
          'pass it in data.productIds[0] or data.metadata.productId.',
      )
    }
    const body: Record<string, unknown> = {}
    if (data.usageLimit != null) body['max_purchase_count'] = data.usageLimit
    if (data.value != null) {
      body['offer_type'] = data.type === 'PERCENTAGE' ? 'percent' : 'cents'
      body['amount_off'] = data.value
    }
    const client = this.clientFor(credentials)
    const res = await client.put<Record<string, unknown>>(
      `/products/${encodeURIComponent(productId)}/offer_codes/${encodeURIComponent(id)}`,
      body,
    )
    const raw = res['offer_code'] as RawGumroadOfferCode
    return transformDiscount(raw, productId)
  }

  async deleteDiscount(
    credentials: Credentials,
    id: string,
    params?: QueryParams,
  ): Promise<void> {
    const productId = params?.['productId'] ?? params?.['product_id']
    if (!productId) {
      throw new Error(
        'Gumroad deleteDiscount requires `productId` in params — ' +
          'offer codes are scoped to a product.',
      )
    }
    await this.clientFor(credentials).delete(
      `/products/${encodeURIComponent(String(productId))}/offer_codes/${encodeURIComponent(id)}`,
    )
  }

  // ── Refunds (derived from Sales API) ─────────────────────────────────────
  //
  // Gumroad has no dedicated refund resource. Refund data is embedded in the
  // sale object via `refunded` and `partially_refunded` boolean flags.
  // listRefunds fetches all sales and filters for refunded ones.
  // getRefund fetches a single sale by id and derives the refund from it.

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const client = this.clientFor(credentials)
    const page = params.page ?? 1
    const queryParams: Record<string, unknown> = { page }
    if (params.updatedAfter) {
      queryParams['after'] = params.updatedAfter.toISOString().split('T')[0]
    }
    const data = await client.get<Record<string, unknown>>('/sales', queryParams)
    const sales = (data['sales'] as Array<Record<string, unknown>> | undefined) ?? []
    const refundedSales = sales.filter(
      (s) => s['refunded'] === true || s['partially_refunded'] === true,
    )
    return refundedSales.map((s) => transformRefund(s as Parameters<typeof transformRefund>[0]))
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    // Strip the 'refund_' prefix if a canonical refund id was passed.
    const saleId = id.startsWith('refund_') ? id.slice('refund_'.length) : id
    const client = this.clientFor(credentials)
    const data = await client.get<Record<string, unknown>>(
      `/sales/${encodeURIComponent(saleId)}`,
    )
    const sale = data['sale'] as Parameters<typeof transformRefund>[0]
    return transformRefund(sale)
  }
}
