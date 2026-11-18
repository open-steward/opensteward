/**
 * Daraz Open Platform adapter for the ecommerce vertical.
 *
 * Maps Daraz's Open Platform API to the canonical ecommerce resources.
 * Daraz is an Alibaba subsidiary operating across South Asia — Bangladesh,
 * Pakistan, Nepal, Sri Lanka, and Myanmar. The API is nearly identical to
 * Lazada's Open Platform (same signing, same endpoints).
 *
 * Slug: `daraz` | Platform identifier: `daraz`
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (21):
 *
 *   Products:      list, get, create, update, delete   (/products/get, /product/item/get, etc.)
 *   Variants:      list, get                           (extracted from product detail)
 *   Inventory:     list, get, adjust, set              (/product/stock/sellable/get, /product/price_quantity/update)
 *   Orders:        list, get                           (/orders/get, /order/get, /order/items/get)
 *   Fulfillments:  list, get, create                   (projected from order items; create via /order/rts)
 *   Collections:   list, get                           (/category/tree/get — read-only category tree)
 *   Transactions:  list                                (/finance/transaction/details/get)
 *   Webhooks:      verify + parse                      (HMAC-SHA256 push notifications)
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * Unavailable: customer  — No buyer/customer profile API; marketplace withholds buyer PII.
 * Unavailable: discount  — No seller-facing promotions/voucher API in Open Platform.
 * Unavailable: location  — Daraz manages warehouse locations internally; no location API.
 * Unavailable: refund    — Refunds handled via dispute resolution portal, no REST endpoint.
 *
 * Omitted write operations (the registry returns HTTP 501 automatically):
 *   Variants mutations (3) — create/update/delete: go through product endpoints.
 *   Collections (3)       — Read-only platform categories; no create/update/delete.
 *   Order mutations (3)   — create/update/cancel: marketplace-controlled.
 *   Fulfillment mutations (2) — update/cancel: marketplace-controlled.
 *   Transactions (2)      — get/create: not supported (list-only finance export).
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { ProductVariant } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { InventoryLevel } from '../../schema/inventory'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Transaction } from '../../schema/transaction'
import type { WebhookEvent } from '../../schema/webhook'

import {
  buildAuthUrl,
  exchangeCode as darazExchangeCode,
  refreshCredentials as darazRefreshCredentials,
} from './auth'
import { DarazClient } from './client'
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
  CATEGORY_TREE,
  FINANCE_TRANSACTION_DETAILS,
} from './constants'
import {
  transformProduct,
  untransformProduct,
  type RawDarazProduct,
} from './transform/product'
import {
  transformOrder,
  type RawDarazOrder,
  type RawDarazOrderItem,
} from './transform/order'
import {
  transformFulfillment,
  transformFulfillments,
} from './transform/fulfillment'
import {
  transformInventoryLevel,
  type RawDarazStockItem,
} from './transform/inventory'
import { extractVariants, findVariant } from './transform/variant'
import {
  transformCategoryTree,
  type RawDarazCategoryTreeEnvelope,
} from './transform/collection'
import {
  transformTransaction,
  type RawDarazTransaction,
  type RawDarazTransactionEnvelope,
} from './transform/transaction'
import {
  verifyWebhookSignature,
  parseWebhookEvents as parseWebhook,
} from './webhook'

export interface DarazAdapterConfig {
  /** Daraz app key. Optional — may come from credentials. */
  appKey?: string
  /** Daraz app secret. Optional — may come from credentials. */
  appSecret?: string
  /** Default country code when credentials do not specify one. */
  country?: string
}

// ── Response envelopes ──────────────────────────────────────────────────────

interface DarazProductsEnvelope {
  data?: {
    products?: RawDarazProduct[]
    total_products?: number
  }
  code?: string
  message?: string
}

interface DarazProductEnvelope {
  data?: RawDarazProduct
  code?: string
  message?: string
}

interface DarazOrdersEnvelope {
  data?: {
    orders?: RawDarazOrder[]
    count_total?: number
  }
  code?: string
  message?: string
}

interface DarazOrderEnvelope {
  data?: RawDarazOrder
  code?: string
  message?: string
}

interface DarazOrderItemsEnvelope {
  data?: RawDarazOrderItem[]
  code?: string
  message?: string
}

interface DarazStockEnvelope {
  data?: RawDarazStockItem[]
  code?: string
  message?: string
}

interface DarazActionEnvelope {
  data?: Record<string, unknown>
  code?: string
  message?: string
}

// Re-export envelope types from transforms for use in methods
type DarazCategoryTreeEnvelope = RawDarazCategoryTreeEnvelope
type DarazTransactionEnvelope = RawDarazTransactionEnvelope

export class DarazAdapter implements EcommerceAdapter {
  readonly platform = PLATFORM_SLUG
  readonly version = '0.1.0'

  private configAppKey: string | undefined
  private configAppSecret: string | undefined
  private configCountry: string

  constructor(config: DarazAdapterConfig = {}) {
    this.configAppKey = config.appKey
    this.configAppSecret = config.appSecret
    this.configCountry = config.country ?? 'pk'
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    const appKey = this.configAppKey
    if (!appKey) {
      throw new Error('Daraz adapter: appKey is required to build the auth URL.')
    }
    return buildAuthUrl(appKey, '', state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    const appKey = this.configAppKey
    const appSecret = this.configAppSecret
    if (!appKey || !appSecret) {
      throw new Error(
        'Daraz adapter: appKey and appSecret are required for code exchange.',
      )
    }
    return darazExchangeCode(code, appKey, appSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return darazRefreshCredentials(credentials)
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

  private clientFor(credentials: Credentials): DarazClient {
    const appKey =
      (credentials.extra?.['appKey'] as string | undefined) ?? this.configAppKey
    const appSecret =
      (credentials.extra?.['appSecret'] as string | undefined) ?? this.configAppSecret
    const country =
      (credentials.extra?.['country'] as string | undefined) ?? this.configCountry
    if (!appKey || !appSecret) {
      throw new Error(
        'Daraz adapter is missing appKey/appSecret — either configure them ' +
          'in apps/integration-server/config/config.yml under adapters.daraz, or POST them to ' +
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
    return new DarazClient(merged)
  }

  private currencyFor(credentials: Credentials): string {
    return (credentials.extra?.['currency'] as string | undefined) ?? 'USD'
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const client = this.clientFor(credentials)
    const currency = this.currencyFor(credentials)
    const res = await client.get<DarazProductsEnvelope>(PRODUCTS_LIST, {
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
    const res = await client.get<DarazProductEnvelope>(PRODUCT_GET, {
      item_id: id,
    })
    if (!res.data) {
      throw new Error(`Daraz getProduct: empty response for item_id '${id}'`)
    }
    return transformProduct(res.data, currency)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const client = this.clientFor(credentials)
    const currency = this.currencyFor(credentials)
    const payload = untransformProduct(data)
    const res = await client.post<DarazActionEnvelope>(
      PRODUCT_CREATE,
      payload,
    )
    if (res.code && res.code !== '0') {
      throw new Error(`Daraz createProduct failed: ${res.code} — ${res.message ?? 'unknown'}`)
    }
    const itemId = res.data?.['item_id'] as string | number | undefined
    if (itemId) {
      return this.getProduct(credentials, String(itemId))
    }
    // Fallback: return a minimal product from the input data
    return transformProduct(
      { item_id: undefined, attributes: { name: data.title }, ...data.metadata } as unknown as RawDarazProduct,
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
    const res = await client.post<DarazActionEnvelope>(PRODUCT_UPDATE, requestPayload)
    if (res.code && res.code !== '0') {
      throw new Error(`Daraz updateProduct failed: ${res.code} — ${res.message ?? 'unknown'}`)
    }
    return this.getProduct(credentials, id)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    const client = this.clientFor(credentials)
    const res = await client.post<DarazActionEnvelope>(PRODUCT_REMOVE, undefined, {
      item_id: id,
    })
    if (res.code && res.code !== '0') {
      throw new Error(`Daraz deleteProduct failed: ${res.code} — ${res.message ?? 'unknown'}`)
    }
  }

  // ── Variants (read-only, extracted from product detail) ───────────────────

  async listVariants(credentials: Credentials, params: QueryParams): Promise<ProductVariant[]> {
    const productId = (params['productId'] ?? params['product_id'] ?? params['item_id']) as
      | string
      | undefined
    if (!productId) {
      throw new Error('Daraz listVariants requires `productId` in query params.')
    }
    const product = await this.getProduct(credentials, productId)
    const currency = this.currencyFor(credentials)
    return extractVariants(product.metadata as unknown as RawDarazProduct, currency)
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    // Variant id may be `${productId}:${skuId}` or just `${skuId}`.
    // If a productId is embedded, use it for a targeted lookup.
    const parts = id.split(':')
    const productId = parts.length > 1 ? parts[0]! : undefined
    const variantId = parts.length > 1 ? parts[1]! : id

    if (!productId) {
      throw new Error(
        'Daraz getVariant requires a composite id formatted as `productId:skuId`.',
      )
    }

    const client = this.clientFor(credentials)
    const currency = this.currencyFor(credentials)
    const res = await client.get<DarazProductEnvelope>(PRODUCT_GET, {
      item_id: productId,
    })
    if (!res.data) {
      throw new Error(`Daraz getVariant: empty response for product '${productId}'`)
    }
    const variant = findVariant(res.data, variantId, currency)
    if (!variant) {
      throw new Error(`Daraz getVariant: no SKU '${variantId}' on product '${productId}'`)
    }
    return variant
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const client = this.clientFor(credentials)
    const res = await client.get<DarazStockEnvelope>(STOCK_GET, {
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
      throw new Error(`Daraz getInventoryLevel: no stock found for '${variantId}'`)
    }
    return found
  }

  async adjustInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; delta: number },
  ): Promise<InventoryLevel> {
    // Daraz only supports absolute stock sets, so we must read current
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
    const res = await client.post<DarazActionEnvelope>(PRICE_QUANTITY_UPDATE, payload)
    if (res.code && res.code !== '0') {
      throw new Error(`Daraz setInventoryLevel failed: ${res.code} — ${res.message ?? 'unknown'}`)
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
    const res = await client.get<DarazOrdersEnvelope>(ORDERS_LIST, {
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
      client.get<DarazOrderEnvelope>(ORDER_GET, { order_id: id }),
      client.get<DarazOrderItemsEnvelope>(ORDER_ITEMS_GET, { order_id: id }),
    ])
    const raw = orderRes.data
    if (!raw) {
      throw new Error(`Daraz getOrder: empty response for order '${id}'`)
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
      throw new Error('Daraz listFulfillments requires `orderId` in query params.')
    }
    const client = this.clientFor(credentials)
    const res = await client.get<DarazOrderItemsEnvelope>(ORDER_ITEMS_GET, {
      order_id: orderId,
    })
    return transformFulfillments(orderId, res.data)
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    // Fulfillment id format: `${orderId}:${orderItemId}`
    const [orderId, itemId] = id.split(':')
    if (!orderId || !itemId) {
      throw new Error('Daraz fulfillment id must be formatted as `orderId:orderItemId`')
    }
    const client = this.clientFor(credentials)
    const res = await client.get<DarazOrderItemsEnvelope>(ORDER_ITEMS_GET, {
      order_id: orderId,
    })
    const items = res.data ?? []
    const item = items.find((i) => String(i.order_item_id) === itemId)
    if (!item) {
      throw new Error(
        `Daraz getFulfillment: no order item '${itemId}' on order '${orderId}'`,
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
      throw new Error('Daraz createFulfillment requires `orderId` in the fulfillment data.')
    }
    const orderItemIds = (data.lineItems ?? []).map((li) => li.lineItemId)
    const res = await client.post<DarazActionEnvelope>(ORDER_RTS, undefined, {
      order_item_ids: JSON.stringify(orderItemIds),
      delivery_type: 'dropship',
      shipment_provider: data.carrier ?? '',
      tracking_number: data.trackingNumber ?? '',
    })
    if (res.code && res.code !== '0') {
      throw new Error(
        `Daraz createFulfillment (RTS) failed: ${res.code} — ${res.message ?? 'unknown'}`,
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

  // ── Collections (read-only platform categories) ───────────────────────────

  async listCollections(
    credentials: Credentials,
    _params: QueryParams,
  ): Promise<Collection[]> {
    const client = this.clientFor(credentials)
    const res = await client.get<DarazCategoryTreeEnvelope>(CATEGORY_TREE)
    const roots = res.data ?? []
    return transformCategoryTree(roots)
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    // The category tree is a full tree; we must scan it to find a specific id.
    const all = await this.listCollections(credentials, {} as QueryParams)
    const found = all.find((c) => c.id === id)
    if (!found) {
      throw new Error(`Daraz getCollection: no category found with id '${id}'`)
    }
    return found
  }

  // ── Transactions (finance export) ─────────────────────────────────────────

  async listTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Transaction[]> {
    const client = this.clientFor(credentials)
    const currency = this.currencyFor(credentials)

    const endTime = new Date().toISOString()
    const startTime =
      params.updatedAfter?.toISOString() ??
      (params['start_time'] as string | undefined) ??
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const res = await client.get<DarazTransactionEnvelope>(FINANCE_TRANSACTION_DETAILS, {
      start_time: startTime,
      end_time: params['end_time'] ?? endTime,
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
      offset: (params['offset'] as number | undefined) ?? 0,
      ...(params['trans_type'] ? { trans_type: params['trans_type'] } : {}),
    })

    const transactions: RawDarazTransaction[] = res.data?.transactions ?? []
    return transactions.map((t) => transformTransaction(t, currency))
  }
}
