/**
 * Jumia Vendor API adapter for the ecommerce vertical.
 *
 * Maps Jumia's Vendor/Seller Center API to the canonical ecommerce resources.
 * Jumia is an African marketplace with 100k+ sellers across Nigeria, Kenya,
 * Egypt, Morocco, Ghana, and other African countries.
 *
 * Slug: `jumia` | Platform identifier: `jumia`
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (15):
 *
 *   Products:     list, get, create, update, delete   (/products)
 *   Variants:     list, get                           (extracted from product detail)
 *   Inventory:    list, get, set                      (/products/stock)
 *   Orders:       list, get                           (/orders)
 *   Fulfillments: list, get, create                   (projected from order items; create via /shipments)
 *   Webhooks:     verify + parse                      (HMAC-SHA256 push notifications)
 *
 * Omitted (27) — the registry will return HTTP 501 automatically:
 *
 *   Variants mutations (3) — create/update/delete: go through product endpoints.
 *   Collections (5)       — Jumia has categories but no user-mutable collections.
 *   Locations (2)         — Jumia manages warehouses internally.
 *   Customers (5)         — No buyer data API for sellers.
 *   Order mutations (3)   — create/update/cancel: marketplace-controlled.
 *   Fulfillment mutations (2) — update/cancel: marketplace-controlled.
 *   Inventory adjust (1)  — Only absolute set supported.
 *   Refunds (3)           — Handled via dispute resolution.
 *   Transactions (3)      — No financial transaction API.
 *   Discounts (5)         — Promotions API too limited to map to canonical
 *                           discounts.
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { ProductVariant } from '../../schema/product'
import type { InventoryLevel } from '../../schema/inventory'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { WebhookEvent } from '../../schema/webhook'

import {
  buildAuthUrl,
  exchangeCode as jumiaExchangeCode,
  refreshCredentials as jumiaRefreshCredentials,
} from './auth'
import { JumiaClient } from './client'
import {
  DEFAULT_PAGE_SIZE,
  PLATFORM_SLUG,
  PRODUCTS_LIST,
  PRODUCT_GET,
  PRODUCT_CREATE,
  PRODUCT_UPDATE,
  PRODUCT_REMOVE,
  STOCK_LIST,
  STOCK_UPDATE,
  ORDERS_LIST,
  ORDER_GET,
  ORDER_ITEMS_GET,
  SHIPMENT_CREATE,
} from './constants'
import {
  transformProduct,
  untransformProduct,
  type RawJumiaProduct,
} from './transform/product'
import {
  transformOrder,
  type RawJumiaOrder,
  type RawJumiaOrderItem,
} from './transform/order'
import {
  transformFulfillment,
  transformFulfillments,
} from './transform/fulfillment'
import {
  transformInventoryLevel,
  type RawJumiaStockItem,
} from './transform/inventory'
import { extractVariants, findVariant } from './transform/variant'
import {
  verifyWebhookSignature,
  parseWebhookEvents as parseWebhook,
} from './webhook'

export interface JumiaAdapterConfig {
  /** Jumia client/app ID. Optional — may come from credentials. */
  clientId?: string
  /** Jumia client/app secret. Optional — may come from credentials. */
  clientSecret?: string
  /** Default country code when credentials do not specify one. */
  country?: string
}

// ── Resource coverage ──────────────────────────────────────────────────────
// Unavailable: collection    — no seller-mutable collections; legacy GetCategoryTree belongs to the retired Seller Center API (HMAC, shut down July 2022), not the current Vendor Center OAuth2 API.
// Unavailable: customer      — Vendor Center API exposes no buyer data to sellers; marketplace-controlled.
// Unavailable: discount      — no promotions or discount code API; voucher promotions are UI-only.
// Unavailable: location      — Jumia manages warehouses internally; no seller-facing locations API.
// Unavailable: refund        — refunds are handled via dispute resolution (UI only); no refund endpoints on Vendor Center API.
// Unavailable: transaction   — no per-order financial transaction API; payout/metrics endpoints exist only in the retired Seller Center API.

// ── Response envelopes ──────────────────────────────────────────────────────

interface JumiaProductsEnvelope {
  data?: {
    products?: RawJumiaProduct[]
    total?: number
  }
  success?: boolean
  message?: string
}

interface JumiaProductEnvelope {
  data?: RawJumiaProduct
  success?: boolean
  message?: string
}

interface JumiaOrdersEnvelope {
  data?: {
    orders?: RawJumiaOrder[]
    total?: number
  }
  success?: boolean
  message?: string
}

interface JumiaOrderEnvelope {
  data?: RawJumiaOrder
  success?: boolean
  message?: string
}

interface JumiaOrderItemsEnvelope {
  data?: RawJumiaOrderItem[]
  success?: boolean
  message?: string
}

interface JumiaStockEnvelope {
  data?: RawJumiaStockItem[]
  success?: boolean
  message?: string
}

interface JumiaActionEnvelope {
  data?: Record<string, unknown>
  success?: boolean
  message?: string
}

export class JumiaAdapter implements EcommerceAdapter {
  readonly platform = PLATFORM_SLUG
  readonly version = '0.1.0'

  private configClientId: string | undefined
  private configClientSecret: string | undefined
  private configCountry: string

  constructor(config: JumiaAdapterConfig = {}) {
    this.configClientId = config.clientId
    this.configClientSecret = config.clientSecret
    this.configCountry = config.country ?? 'ng'
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    const clientId = this.configClientId
    if (!clientId) {
      throw new Error('Jumia adapter: clientId is required to build the auth URL.')
    }
    return buildAuthUrl(clientId, '', state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    const clientId = this.configClientId
    const clientSecret = this.configClientSecret
    if (!clientId || !clientSecret) {
      throw new Error(
        'Jumia adapter: clientId and clientSecret are required for code exchange.',
      )
    }
    return jumiaExchangeCode(code, clientId, clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return jumiaRefreshCredentials(credentials)
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  verifyWebhookSignature(body: string, signature: string): boolean {
    const clientSecret =
      this.configClientSecret ?? ''
    return verifyWebhookSignature(body, signature, clientSecret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseWebhook(payload)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): JumiaClient {
    const clientId =
      (credentials.extra?.['clientId'] as string | undefined) ?? this.configClientId
    const clientSecret =
      (credentials.extra?.['clientSecret'] as string | undefined) ?? this.configClientSecret
    const country =
      (credentials.extra?.['country'] as string | undefined) ?? this.configCountry
    if (!clientId || !clientSecret) {
      throw new Error(
        'Jumia adapter is missing clientId/clientSecret — either configure them ' +
          'in apps/integration-server/config/config.yml under adapters.jumia, or POST them to ' +
          '/v1/connections with credentials: {clientId, clientSecret, accessToken, refreshToken, country}.',
      )
    }
    const merged: Credentials = {
      ...credentials,
      extra: {
        ...credentials.extra,
        clientId,
        clientSecret,
        country,
      },
    }
    return new JumiaClient(merged)
  }

  private currencyFor(credentials: Credentials): string {
    return (credentials.extra?.['currency'] as string | undefined) ?? 'NGN'
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const client = this.clientFor(credentials)
    const currency = this.currencyFor(credentials)
    const res = await client.get<JumiaProductsEnvelope>(PRODUCTS_LIST, {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
      offset: (params['offset'] as number | undefined) ?? 0,
      ...(params['filter'] ? { filter: params['filter'] } : {}),
    })
    const products = res.data?.products ?? []
    return products.map((p) => transformProduct(p, currency))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const client = this.clientFor(credentials)
    const currency = this.currencyFor(credentials)
    const res = await client.get<JumiaProductEnvelope>(`${PRODUCT_GET}/${id}`)
    if (!res.data) {
      throw new Error(`Jumia getProduct: empty response for product_id '${id}'`)
    }
    return transformProduct(res.data, currency)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const client = this.clientFor(credentials)
    const currency = this.currencyFor(credentials)
    const payload = untransformProduct(data)
    const res = await client.post<JumiaActionEnvelope>(
      PRODUCT_CREATE,
      payload,
    )
    if (res.success === false) {
      throw new Error(`Jumia createProduct failed: ${res.message ?? 'unknown'}`)
    }
    const productId = res.data?.['product_id'] as string | number | undefined
    if (productId) {
      return this.getProduct(credentials, String(productId))
    }
    // Fallback: return a minimal product from the input data
    return transformProduct(
      { product_id: undefined, name: data.title, ...data.metadata } as unknown as RawJumiaProduct,
      currency,
    )
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const client = this.clientFor(credentials)
    const payload = untransformProduct({ ...data, id })
    const res = await client.put<JumiaActionEnvelope>(`${PRODUCT_UPDATE}/${id}`, payload)
    if (res.success === false) {
      throw new Error(`Jumia updateProduct failed: ${res.message ?? 'unknown'}`)
    }
    return this.getProduct(credentials, id)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    const client = this.clientFor(credentials)
    const res = await client.delete<JumiaActionEnvelope>(`${PRODUCT_REMOVE}/${id}`)
    if (res.success === false) {
      throw new Error(`Jumia deleteProduct failed: ${res.message ?? 'unknown'}`)
    }
  }

  // ── Variants (read-only, extracted from product detail) ───────────────────

  async listVariants(credentials: Credentials, params: QueryParams): Promise<ProductVariant[]> {
    const productId = (params['productId'] ?? params['product_id']) as
      | string
      | undefined
    if (!productId) {
      throw new Error('Jumia listVariants requires `productId` in query params.')
    }
    const product = await this.getProduct(credentials, productId)
    const currency = this.currencyFor(credentials)
    return extractVariants(product.metadata as unknown as RawJumiaProduct, currency)
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    // Variant id may be `${productId}:${skuId}` or just `${skuId}`.
    const parts = id.split(':')
    const productId = parts.length > 1 ? parts[0]! : undefined
    const variantId = parts.length > 1 ? parts[1]! : id

    if (!productId) {
      throw new Error(
        'Jumia getVariant requires a composite id formatted as `productId:skuId`.',
      )
    }

    const client = this.clientFor(credentials)
    const currency = this.currencyFor(credentials)
    const res = await client.get<JumiaProductEnvelope>(`${PRODUCT_GET}/${productId}`)
    if (!res.data) {
      throw new Error(`Jumia getVariant: empty response for product '${productId}'`)
    }
    const variant = findVariant(res.data, variantId, currency)
    if (!variant) {
      throw new Error(`Jumia getVariant: no SKU '${variantId}' on product '${productId}'`)
    }
    return variant
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const client = this.clientFor(credentials)
    const res = await client.get<JumiaStockEnvelope>(STOCK_LIST, {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
      offset: (params['offset'] as number | undefined) ?? 0,
    })
    const items = res.data ?? []
    return items.map(transformInventoryLevel)
  }

  async getInventoryLevel(credentials: Credentials, id: string): Promise<InventoryLevel> {
    // Canonical ids are `${variantId}:${locationId}`. Strip the location portion.
    const variantId = id.includes(':') ? id.split(':')[0]! : id
    const levels = await this.listInventoryLevels(credentials, {} as QueryParams)
    const found = levels.find(
      (l) => l.variantId === variantId || l.id === id,
    )
    if (!found) {
      throw new Error(`Jumia getInventoryLevel: no stock found for '${variantId}'`)
    }
    return found
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const client = this.clientFor(credentials)
    const payload = {
      stock: [
        {
          sku_id: data.variantId,
          quantity: data.available,
        },
      ],
    }
    const res = await client.put<JumiaActionEnvelope>(STOCK_UPDATE, payload)
    if (res.success === false) {
      throw new Error(`Jumia setInventoryLevel failed: ${res.message ?? 'unknown'}`)
    }
    // Re-fetch to return the updated level
    return this.getInventoryLevel(credentials, data.variantId)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = this.clientFor(credentials)
    const currency = this.currencyFor(credentials)
    const createdAfter =
      params.updatedAfter?.toISOString() ??
      (params['created_after'] as string | undefined) ??
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const res = await client.get<JumiaOrdersEnvelope>(ORDERS_LIST, {
      created_after: createdAfter,
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
      offset: (params['offset'] as number | undefined) ?? 0,
      ...(params['status'] ? { status: params['status'] } : {}),
    })
    const orders = res.data?.orders ?? []
    return orders.map((o) => transformOrder(o, currency))
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = this.clientFor(credentials)
    const currency = this.currencyFor(credentials)
    const [orderRes, itemsRes] = await Promise.all([
      client.get<JumiaOrderEnvelope>(`${ORDER_GET}/${id}`),
      client.get<JumiaOrderItemsEnvelope>(`${ORDER_ITEMS_GET}/${id}/items`),
    ])
    const raw = orderRes.data
    if (!raw) {
      throw new Error(`Jumia getOrder: empty response for order '${id}'`)
    }
    // Merge items into the order
    raw.order_items = itemsRes.data ?? []
    return transformOrder(raw, currency)
  }

  // ── Fulfillments ──────────────────────────────────────────────────────────

  async listFulfillments(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Fulfillment[]> {
    const orderId = (params['orderId'] ?? params['order_id']) as string | undefined
    if (!orderId) {
      throw new Error('Jumia listFulfillments requires `orderId` in query params.')
    }
    const client = this.clientFor(credentials)
    const res = await client.get<JumiaOrderItemsEnvelope>(
      `${ORDER_ITEMS_GET}/${orderId}/items`,
    )
    return transformFulfillments(orderId, res.data)
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    // Fulfillment id format: `${orderId}:${orderItemId}`
    const [orderId, itemId] = id.split(':')
    if (!orderId || !itemId) {
      throw new Error('Jumia fulfillment id must be formatted as `orderId:orderItemId`')
    }
    const client = this.clientFor(credentials)
    const res = await client.get<JumiaOrderItemsEnvelope>(
      `${ORDER_ITEMS_GET}/${orderId}/items`,
    )
    const items = res.data ?? []
    const item = items.find((i) => String(i.order_item_id) === itemId)
    if (!item) {
      throw new Error(
        `Jumia getFulfillment: no order item '${itemId}' on order '${orderId}'`,
      )
    }
    return transformFulfillment(orderId, item)
  }

  async createFulfillment(
    credentials: Credentials,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    const client = this.clientFor(credentials)
    const orderId = data.orderId
    if (!orderId) {
      throw new Error('Jumia createFulfillment requires `orderId` in the fulfillment data.')
    }
    const orderItemIds = (data.lineItems ?? []).map((li) => li.lineItemId)
    const res = await client.post<JumiaActionEnvelope>(SHIPMENT_CREATE, {
      order_id: orderId,
      order_item_ids: orderItemIds,
      shipment_provider: data.carrier ?? '',
      tracking_number: data.trackingNumber ?? '',
    })
    if (res.success === false) {
      throw new Error(
        `Jumia createFulfillment failed: ${res.message ?? 'unknown'}`,
      )
    }
    // Return a projected fulfillment from the input data
    return {
      id: `${orderId}:shipment`,
      orderId,
      status: 'OPEN',
      trackingNumber: data.trackingNumber,
      carrier: data.carrier,
      lineItems: data.lineItems,
      metadata: { shipmentResponse: res.data ?? {} },
    }
  }
}
