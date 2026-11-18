/**
 * Lazada Open Platform adapter for the ecommerce vertical.
 *
 * Maps Lazada's Open Platform API to the canonical ecommerce resources.
 * Lazada is an Alibaba-owned SEA marketplace with 7M+ sellers across
 * Singapore, Malaysia, Thailand, Philippines, Vietnam, and Indonesia.
 *
 * Slug: `lazada` | Platform identifier: `lazada`
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (17):
 *
 *   Products:    list, get, create, update, delete   (/products/get, /product/item/get, etc.)
 *   Variants:    list, get                           (extracted from product detail)
 *   Inventory:   list, get, adjust, set              (/product/stock/sellable/get, /product/price_quantity/update)
 *   Orders:      list, get                           (/orders/get, /order/get, /order/items/get)
 *   Fulfillments: list, get, create                  (projected from order items; create via /order/rts)
 *   Webhooks:    verify + parse                      (HMAC-SHA256 push notifications)
 *
 * Omitted (25) — the registry will return HTTP 501 automatically:
 *
 *   Variants mutations (3) — create/update/delete: go through product endpoints.
 *   Collections (5)       — Lazada has categories but no user-mutable collections.
 *   Locations (2)         — Lazada manages warehouses internally.
 *   Customers (5)         — No buyer data API.
 *   Order mutations (3)   — create/update/cancel: marketplace-controlled.
 *   Fulfillment mutations (2) — update/cancel: marketplace-controlled.
 *   Refunds (3)           — Handled via dispute resolution.
 *   Transactions (3)      — No financial transaction API.
 *   Discounts (5)         — Promotions API too limited to map to canonical
 *                           discounts.
 */

// ── Resource coverage ──────────────────────────────────────────────────────────
// Unavailable: collection   — Lazada exposes read-only taxonomy categories (/category/tree/get) but has no user-mutable seller collections.
// Unavailable: customer     — Lazada Open Platform has no buyer/customer data API; shopper PII is not exposed to sellers.
// Unavailable: location     — Lazada manages warehouse locations internally; there is no seller-facing warehouse or location API.
// Unverified:  refund       — /order/reverse/return/detail/list and related reverse-order endpoints are confirmed to exist, but the JS-rendered docs were inaccessible so response field names could not be verified.
// Unverified:  transaction  — /finance/transaction/details/get and /finance/transaction/accountTransactions/query are confirmed to exist, but the JS-rendered docs were inaccessible so response field names could not be verified.
// Unverified:  discount     — /promotion/voucher/create and related voucher endpoints are confirmed to exist, but the JS-rendered docs were inaccessible so request/response field names could not be verified.

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
  exchangeCode as lazadaExchangeCode,
  refreshCredentials as lazadaRefreshCredentials,
} from './auth'
import { LazadaClient } from './client'
import {
  DEFAULT_PAGE_SIZE,
  PLATFORM_SLUG,
  PRODUCTS_LIST,
  PRODUCT_GET,
  PRODUCT_CREATE,
  PRODUCT_UPDATE,
  PRODUCT_REMOVE,
  STOCK_GET,
  PRICE_QUANTITY_UPDATE,
  ORDERS_LIST,
  ORDER_GET,
  ORDER_ITEMS_GET,
  ORDER_RTS,
} from './constants'
import {
  transformProduct,
  untransformProduct,
  type RawLazadaProduct,
} from './transform/product'
import {
  transformOrder,
  type RawLazadaOrder,
  type RawLazadaOrderItem,
} from './transform/order'
import {
  transformFulfillment,
  transformFulfillments,
} from './transform/fulfillment'
import {
  transformInventoryLevel,
  type RawLazadaStockItem,
} from './transform/inventory'
import { extractVariants, findVariant } from './transform/variant'
import {
  verifyWebhookSignature,
  parseWebhookEvents as parseWebhook,
} from './webhook'

export interface LazadaAdapterConfig {
  /** Lazada app key. Optional — may come from credentials. */
  appKey?: string
  /** Lazada app secret. Optional — may come from credentials. */
  appSecret?: string
  /** Default country code when credentials do not specify one. */
  country?: string
}

// ── Response envelopes ──────────────────────────────────────────────────────

interface LazadaProductsEnvelope {
  data?: {
    products?: RawLazadaProduct[]
    total_products?: number
  }
  code?: string
  message?: string
}

interface LazadaProductEnvelope {
  data?: RawLazadaProduct
  code?: string
  message?: string
}

interface LazadaOrdersEnvelope {
  data?: {
    orders?: RawLazadaOrder[]
    count_total?: number
  }
  code?: string
  message?: string
}

interface LazadaOrderEnvelope {
  data?: RawLazadaOrder
  code?: string
  message?: string
}

interface LazadaOrderItemsEnvelope {
  data?: RawLazadaOrderItem[]
  code?: string
  message?: string
}

interface LazadaStockEnvelope {
  data?: RawLazadaStockItem[]
  code?: string
  message?: string
}

interface LazadaActionEnvelope {
  data?: Record<string, unknown>
  code?: string
  message?: string
}

export class LazadaAdapter implements EcommerceAdapter {
  readonly platform = PLATFORM_SLUG
  readonly version = '0.1.0'

  private configAppKey: string | undefined
  private configAppSecret: string | undefined
  private configCountry: string

  constructor(config: LazadaAdapterConfig = {}) {
    this.configAppKey = config.appKey
    this.configAppSecret = config.appSecret
    this.configCountry = config.country ?? 'sg'
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    const appKey = this.configAppKey
    if (!appKey) {
      throw new Error('Lazada adapter: appKey is required to build the auth URL.')
    }
    return buildAuthUrl(appKey, '', state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    const appKey = this.configAppKey
    const appSecret = this.configAppSecret
    if (!appKey || !appSecret) {
      throw new Error(
        'Lazada adapter: appKey and appSecret are required for code exchange.',
      )
    }
    return lazadaExchangeCode(code, appKey, appSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return lazadaRefreshCredentials(credentials)
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  verifyWebhookSignature(body: string, signature: string): boolean {
    const appSecret =
      this.configAppSecret ?? ''
    return verifyWebhookSignature(body, signature, appSecret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseWebhook(payload)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): LazadaClient {
    const appKey =
      (credentials.extra?.['appKey'] as string | undefined) ?? this.configAppKey
    const appSecret =
      (credentials.extra?.['appSecret'] as string | undefined) ?? this.configAppSecret
    const country =
      (credentials.extra?.['country'] as string | undefined) ?? this.configCountry
    if (!appKey || !appSecret) {
      throw new Error(
        'Lazada adapter is missing appKey/appSecret — either configure them ' +
          'in apps/integration-server/config/config.yml under adapters.lazada, or POST them to ' +
          '/v1/connections with credentials: {appKey, appSecret, accessToken, refreshToken, country}.',
      )
    }
    const merged: Credentials = {
      ...credentials,
      extra: {
        ...credentials.extra,
        appKey,
        appSecret,
        country,
      },
    }
    return new LazadaClient(merged)
  }

  private currencyFor(credentials: Credentials): string {
    return (credentials.extra?.['currency'] as string | undefined) ?? 'USD'
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const client = this.clientFor(credentials)
    const currency = this.currencyFor(credentials)
    const res = await client.get<LazadaProductsEnvelope>(PRODUCTS_LIST, {
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
    const res = await client.get<LazadaProductEnvelope>(PRODUCT_GET, {
      item_id: id,
    })
    if (!res.data) {
      throw new Error(`Lazada getProduct: empty response for item_id '${id}'`)
    }
    return transformProduct(res.data, currency)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const client = this.clientFor(credentials)
    const currency = this.currencyFor(credentials)
    const payload = untransformProduct(data)
    const res = await client.post<LazadaActionEnvelope>(
      PRODUCT_CREATE,
      payload,
    )
    if (res.code && res.code !== '0') {
      throw new Error(`Lazada createProduct failed: ${res.code} — ${res.message ?? 'unknown'}`)
    }
    const itemId = res.data?.['item_id'] as string | number | undefined
    if (itemId) {
      return this.getProduct(credentials, String(itemId))
    }
    // Fallback: return a minimal product from the input data
    return transformProduct(
      { item_id: undefined, attributes: { name: data.title }, ...data.metadata } as unknown as RawLazadaProduct,
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
    // Inject the item_id into the payload for updates
    const requestPayload = payload as { Request?: { Product?: Record<string, unknown> } }
    if (requestPayload.Request?.Product) {
      requestPayload.Request.Product['ItemId'] = id
    }
    const res = await client.post<LazadaActionEnvelope>(PRODUCT_UPDATE, requestPayload)
    if (res.code && res.code !== '0') {
      throw new Error(`Lazada updateProduct failed: ${res.code} — ${res.message ?? 'unknown'}`)
    }
    return this.getProduct(credentials, id)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    const client = this.clientFor(credentials)
    const res = await client.post<LazadaActionEnvelope>(PRODUCT_REMOVE, undefined, {
      item_id: id,
    })
    if (res.code && res.code !== '0') {
      throw new Error(`Lazada deleteProduct failed: ${res.code} — ${res.message ?? 'unknown'}`)
    }
  }

  // ── Variants (read-only, extracted from product detail) ───────────────────

  async listVariants(credentials: Credentials, params: QueryParams): Promise<ProductVariant[]> {
    const productId = (params['productId'] ?? params['product_id'] ?? params['item_id']) as
      | string
      | undefined
    if (!productId) {
      throw new Error('Lazada listVariants requires `productId` in query params.')
    }
    const product = await this.getProduct(credentials, productId)
    const currency = this.currencyFor(credentials)
    return extractVariants(product.metadata as unknown as RawLazadaProduct, currency)
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    // Variant id may be `${productId}:${skuId}` or just `${skuId}`.
    // If a productId is embedded, use it for a targeted lookup.
    const parts = id.split(':')
    const productId = parts.length > 1 ? parts[0]! : undefined
    const variantId = parts.length > 1 ? parts[1]! : id

    if (!productId) {
      throw new Error(
        'Lazada getVariant requires a composite id formatted as `productId:skuId`.',
      )
    }

    const client = this.clientFor(credentials)
    const currency = this.currencyFor(credentials)
    const res = await client.get<LazadaProductEnvelope>(PRODUCT_GET, {
      item_id: productId,
    })
    if (!res.data) {
      throw new Error(`Lazada getVariant: empty response for product '${productId}'`)
    }
    const variant = findVariant(res.data, variantId, currency)
    if (!variant) {
      throw new Error(`Lazada getVariant: no SKU '${variantId}' on product '${productId}'`)
    }
    return variant
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const client = this.clientFor(credentials)
    const res = await client.get<LazadaStockEnvelope>(STOCK_GET, {
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
      throw new Error(`Lazada getInventoryLevel: no stock found for '${variantId}'`)
    }
    return found
  }

  async adjustInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; delta: number },
  ): Promise<InventoryLevel> {
    // Lazada only supports absolute stock sets, so we must read current
    // stock first and then apply the delta.
    const current = await this.getInventoryLevel(credentials, data.variantId)
    const newAvailable = Math.max(0, current.available + data.delta)
    return this.setInventoryLevel(credentials, {
      variantId: data.variantId,
      locationId: data.locationId,
      available: newAvailable,
    })
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const client = this.clientFor(credentials)
    const payload = {
      Request: {
        Product: {
          Skus: {
            Sku: [
              {
                SkuId: data.variantId,
                quantity: data.available,
              },
            ],
          },
        },
      },
    }
    const res = await client.post<LazadaActionEnvelope>(PRICE_QUANTITY_UPDATE, payload)
    if (res.code && res.code !== '0') {
      throw new Error(`Lazada setInventoryLevel failed: ${res.code} — ${res.message ?? 'unknown'}`)
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
    const res = await client.get<LazadaOrdersEnvelope>(ORDERS_LIST, {
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
      client.get<LazadaOrderEnvelope>(ORDER_GET, { order_id: id }),
      client.get<LazadaOrderItemsEnvelope>(ORDER_ITEMS_GET, { order_id: id }),
    ])
    const raw = orderRes.data
    if (!raw) {
      throw new Error(`Lazada getOrder: empty response for order '${id}'`)
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
      throw new Error('Lazada listFulfillments requires `orderId` in query params.')
    }
    const client = this.clientFor(credentials)
    const res = await client.get<LazadaOrderItemsEnvelope>(ORDER_ITEMS_GET, {
      order_id: orderId,
    })
    return transformFulfillments(orderId, res.data)
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    // Fulfillment id format: `${orderId}:${orderItemId}`
    const [orderId, itemId] = id.split(':')
    if (!orderId || !itemId) {
      throw new Error('Lazada fulfillment id must be formatted as `orderId:orderItemId`')
    }
    const client = this.clientFor(credentials)
    const res = await client.get<LazadaOrderItemsEnvelope>(ORDER_ITEMS_GET, {
      order_id: orderId,
    })
    const items = res.data ?? []
    const item = items.find((i) => String(i.order_item_id) === itemId)
    if (!item) {
      throw new Error(
        `Lazada getFulfillment: no order item '${itemId}' on order '${orderId}'`,
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
      throw new Error('Lazada createFulfillment requires `orderId` in the fulfillment data.')
    }
    const orderItemIds = (data.lineItems ?? []).map((li) => li.lineItemId)
    const res = await client.post<LazadaActionEnvelope>(ORDER_RTS, undefined, {
      order_item_ids: JSON.stringify(orderItemIds),
      delivery_type: 'dropship',
      shipment_provider: data.carrier ?? '',
      tracking_number: data.trackingNumber ?? '',
    })
    if (res.code && res.code !== '0') {
      throw new Error(
        `Lazada createFulfillment (RTS) failed: ${res.code} — ${res.message ?? 'unknown'}`,
      )
    }
    // Return a projected fulfillment from the input data
    return {
      id: `${orderId}:rts`,
      orderId,
      status: 'OPEN',
      trackingNumber: data.trackingNumber,
      carrier: data.carrier,
      lineItems: data.lineItems,
      metadata: { rtsResponse: res.data ?? {} },
    }
  }
}
