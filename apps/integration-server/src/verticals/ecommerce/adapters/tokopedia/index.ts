/**
 * Tokopedia adapter for the ecommerce vertical.
 *
 * Maps Tokopedia's Open API to the canonical ecommerce resources.
 * OAuth2 authorization-code flow.
 *
 * Slug: `tokopedia`
 */

// ── Resource coverage ──────────────────────────────────────────────
// Available:   collection, fulfillment, inventory, order, product
// Unavailable: customer   — no standalone buyer-list endpoint; buyer data is embedded in orders only
// Unavailable: discount   — no list-discounts API; promo codes exist in seller UI only
// Unavailable: location   — warehouse management is internal; no location-list endpoint
// Unavailable: refund     — only action endpoints (approve cancellation); no GET refund resource
// Unverified:  transaction — Finance/Statistic API mentioned in docs but exact endpoint path and
//                            response shape unverifiable (developer.tokopedia.com redirects to TikTok Shop)

import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Collection } from '../../schema/collection'
import type { Fulfillment } from '../../schema/fulfillment'
import type { InventoryLevel } from '../../schema/inventory'
import type { Order } from '../../schema/order'
import type { Product } from '../../schema/product'

import { TokopediaClient } from './client'
import {
  SHOWCASE_LIST_PATH,
  LOGISTICS_STATUS_PATH,
  ORDER_LIST_PATH,
  ORDER_GET_PATH,
  PRODUCT_LIST_PATH,
  PRODUCT_GET_PATH,
  DEFAULT_PAGE_SIZE,
} from './constants'

import { transformCollection, type RawTokopediaShowcaseResponse } from './transform/collection'
import { transformFulfillment } from './transform/fulfillment'
import { transformInventoryLevel, type RawTokopediaInventoryItem } from './transform/inventory'
import { transformOrder, type RawTokopediaOrder } from './transform/order'
import { transformProduct, type RawTokopediaProduct } from './transform/product'

// ── Response envelope types ──────────────────────────────────────────────────

interface TokopediaListOrdersResponse {
  header?: { total_data?: number; process_time?: number; messages?: string }
  data?: RawTokopediaOrder[]
}

interface TokopediaGetOrderResponse {
  header?: { process_time?: number; messages?: string }
  data?: RawTokopediaOrder
}

interface TokopediaProductListResponse {
  header?: { total_data?: number; process_time?: number; messages?: string }
  data?: { products?: RawTokopediaProduct[] }
}

interface TokopediaInventoryListResponse {
  header?: { process_time?: number; messages?: string }
  data?: { product_list?: RawTokopediaInventoryItem[] }
}

interface TokopediaShippingInfoResponse {
  header?: { process_time?: number; messages?: string }
  data?: import('./transform/fulfillment').RawTokopediaShippingInfo
}

// ── Adapter config ───────────────────────────────────────────────────────────

export interface TokopediaAdapterConfig {
  clientId?: string
  clientSecret?: string
  shopId?: string
}

// ── Adapter class ────────────────────────────────────────────────────────────

export class TokopediaAdapter implements EcommerceAdapter {
  readonly platform = 'tokopedia'
  readonly version = '0.1.0'

  private configClientId: string | undefined
  private configClientSecret: string | undefined
  private configShopId: string | undefined

  constructor(config: TokopediaAdapterConfig = {}) {
    this.configClientId = config.clientId
    this.configClientSecret = config.clientSecret
    this.configShopId = config.shopId
  }

  getAuthUrl(state: string): string {
    const clientId = this.configClientId
    if (!clientId) throw new Error('Tokopedia adapter requires clientId for auth URL.')
    return `https://accounts.tokopedia.com/authorize?client_id=${encodeURIComponent(clientId)}&response_type=code&state=${encodeURIComponent(state)}`
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('Tokopedia exchangeCode not yet implemented.')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Collections ────────────────────────────────────────────────────────────

  async listCollections(credentials: Credentials, _params: QueryParams): Promise<Collection[]> {
    const client = new TokopediaClient(credentials)
    const shopId = (credentials.extra?.['shopId'] as string | undefined) ?? this.configShopId
    if (!shopId) throw new Error('Tokopedia listCollections requires shopId in credentials.extra or adapter config.')

    const res = await client.get<RawTokopediaShowcaseResponse>(SHOWCASE_LIST_PATH, { shop_id: shopId })
    const showcases = res.data?.showcase ?? []
    return showcases.map(transformCollection)
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const collections = await this.listCollections(credentials, {})
    const found = collections.find((c) => c.id === id)
    if (!found) throw new Error(`Tokopedia showcase not found: ${id}`)
    return found
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new TokopediaClient(credentials)
    const page = typeof params['page'] === 'number' ? params['page'] : 1
    const perPage = typeof params['perPage'] === 'number' ? params['perPage'] : DEFAULT_PAGE_SIZE

    const res = await client.get<TokopediaListOrdersResponse>(ORDER_LIST_PATH, {
      page,
      per_page: perPage,
      ...(params['fromDate'] ? { from_date: params['fromDate'] } : {}),
      ...(params['toDate'] ? { to_date: params['toDate'] } : {}),
    })

    return (res.data ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new TokopediaClient(credentials)
    const res = await client.get<TokopediaGetOrderResponse>(ORDER_GET_PATH, { order_id: id })
    if (!res.data) throw new Error(`Tokopedia order not found: ${id}`)
    return transformOrder(res.data)
  }

  // ── Fulfillments ──────────────────────────────────────────────────────────

  async listFulfillments(credentials: Credentials, params: QueryParams): Promise<Fulfillment[]> {
    const orders = await this.listOrders(credentials, params)
    const client = new TokopediaClient(credentials)

    return Promise.all(
      orders.map(async (order) => {
        try {
          const res = await client.get<TokopediaShippingInfoResponse>(
            LOGISTICS_STATUS_PATH,
            { order_id: order.id },
          )
          const rawOrder = { order_id: Number(order.id), order_status: undefined as number | undefined } as RawTokopediaOrder
          return transformFulfillment(rawOrder, res.data)
        } catch {
          const rawOrder = { order_id: Number(order.id) } as RawTokopediaOrder
          return transformFulfillment(rawOrder)
        }
      }),
    )
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const orderId = id.replace(/:shipping$/, '')
    const order = await this.getOrder(credentials, orderId)
    const client = new TokopediaClient(credentials)

    try {
      const res = await client.get<TokopediaShippingInfoResponse>(
        LOGISTICS_STATUS_PATH,
        { order_id: orderId },
      )
      const rawOrder = { order_id: Number(order.id) } as RawTokopediaOrder
      return transformFulfillment(rawOrder, res.data)
    } catch {
      const rawOrder = { order_id: Number(order.id) } as RawTokopediaOrder
      return transformFulfillment(rawOrder)
    }
  }

  // ── Products ───────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const client = new TokopediaClient(credentials)
    const page = typeof params['page'] === 'number' ? params['page'] : 1
    const perPage = typeof params['perPage'] === 'number' ? params['perPage'] : DEFAULT_PAGE_SIZE

    const res = await client.get<TokopediaProductListResponse>(PRODUCT_LIST_PATH, {
      page,
      per_page: perPage,
    })

    return (res.data?.products ?? []).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const client = new TokopediaClient(credentials)
    const res = await client.get<TokopediaProductListResponse>(PRODUCT_GET_PATH, {
      product_id: id,
    })
    const raw = res.data?.products?.[0]
    if (!raw) throw new Error(`Tokopedia product not found: ${id}`)
    return transformProduct(raw)
  }

  // ── Inventory ──────────────────────────────────────────────────────────────

  async listInventoryLevels(credentials: Credentials, _params: QueryParams): Promise<InventoryLevel[]> {
    const client = new TokopediaClient(credentials)
    const res = await client.get<TokopediaInventoryListResponse>(
      '/inventory/v1/fs/:fs_id/product/info',
      { with_stock: true },
    )
    return (res.data?.product_list ?? []).map(transformInventoryLevel)
  }
}
