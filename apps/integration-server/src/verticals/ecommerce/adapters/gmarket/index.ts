import { simpleApiKey } from '@opensteward/shared'
/**
 * Gmarket adapter for the ecommerce vertical.
 *
 * Maps Gmarket's seller REST API to the canonical ecommerce resources.
 * Gmarket is a Korea eBay-owned marketplace (seller-scoped, many 501s,
 * API key auth).
 *
 * Slug: `gmarket`
 * Platform identifier: `gmarket`
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (15):
 *
 *   Products:     list, get, create, update, delete   (Product API)
 *   Inventory:    list, get, adjust, set              (Inventory/Product API)
 *   Orders:       list, get                           (Order API)
 *   Fulfillments: list, get, create                   (Fulfillment API)
 *   Webhooks:     verify + parse
 *
 * Omitted (27) — the registry will return HTTP 501 automatically:
 *
 *   Variants (5)    — Gmarket uses product options, not variant resources.
 *   Collections (5) — Gmarket has no user-mutable collections via API.
 *   Locations (2)   — Gmarket does not expose locations.
 *   Customers (5)   — Gmarket does not expose buyer data to sellers; buyer info is embedded in orders only.
 *   createOrder, updateOrder, cancelOrder — buyers create orders.
 *   updateFulfillment, cancelFulfillment — not supported.
 *
 * ── Resource coverage ──────────────────────────────────────────────────
 * Unavailable: collection — Gmarket has no user-mutable collection API; uses fixed internal category trees.
 * Unavailable: customer  — No standalone buyer/customer resource; buyer info embedded in orders only.
 * Unavailable: location  — Gmarket does not expose seller locations via API.
 * Unverified:  refund    — Return/refund inquiry endpoint exists in ESM Plus API (sa2.esmplus.com/claim/v1/sa/Returns, documented at etapi.gmarket.com/53) but uses a different base URL and auth system from this adapter's api.gmarket.co.kr base; compatibility unconfirmed.
 * Unverified:  transaction — Sales settlement inquiry endpoint exists in ESM Plus API (sa2.esmplus.com/account/v1/settle/getsettleorder, documented at etapi.gmarket.com/41) but uses a different base URL and auth system; compatibility unconfirmed.
 * Unverified:  discount  — Seller discount API exists in ESM Plus (sa2.esmplus.com/item/v1/goods/{goodsNo}/seller-discounts, documented at etapi.gmarket.com/25) but is product-scoped and uses a different base URL/system; compatibility unconfirmed.
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { InventoryLevel } from '../../schema/inventory'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { WebhookEvent } from '../../schema/webhook'

import {
  buildAuthUrl,
  exchangeCode as gmarketExchangeCode,
  refreshCredentials as gmarketRefreshCredentials,
} from './auth'
import { GmarketClient } from './client'
import {
  DEFAULT_PAGE_SIZE,
  PRODUCTS_BASE,
  ORDERS_BASE,
  INVENTORY_BASE,
  FULFILLMENTS_BASE,
} from './constants'
import {
  transformProduct,
  untransformProduct,
  type RawGmarketProduct,
} from './transform/product'
import { transformOrder, type RawGmarketOrder } from './transform/order'
import {
  transformInventoryLevel,
  DEFAULT_LOCATION_ID,
  type RawGmarketInventoryItem,
} from './transform/inventory'
import {
  transformFulfillment,
  transformFulfillments,
  untransformFulfillment,
  type RawGmarketFulfillment,
} from './transform/fulfillment'

// ── Response envelopes ────────────────────────────────────────────────────────

interface RawProductsEnvelope {
  products?: RawGmarketProduct[]
  totalCount?: number
  page?: number
  pageSize?: number
}

interface RawOrdersEnvelope {
  orders?: RawGmarketOrder[]
  totalCount?: number
  page?: number
  pageSize?: number
}

interface RawInventoryEnvelope {
  items?: RawGmarketInventoryItem[]
  totalCount?: number
  page?: number
  pageSize?: number
}

interface RawFulfillmentsEnvelope {
  fulfillments?: RawGmarketFulfillment[]
  totalCount?: number
}

export interface GmarketAdapterConfig {
  /** Gmarket API key. Optional — may come from credentials. */
  apiKey?: string
  /** Gmarket API secret. Optional — may come from credentials. */
  apiSecret?: string
  /** Gmarket seller ID. Optional — may come from credentials. */
  sellerId?: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class GmarketAdapter implements EcommerceAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'gmarket'
  readonly version = '0.1.0'

  private configApiKey: string | undefined
  private configApiSecret: string | undefined
  private configSellerId: string | undefined

  constructor(config: GmarketAdapterConfig = {}) {
    this.configApiKey = config.apiKey
    this.configApiSecret = config.apiSecret
    this.configSellerId = config.sellerId
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return gmarketExchangeCode(code, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return gmarketRefreshCredentials(credentials)
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  verifyWebhookSignature(
    payload: Record<string, unknown>,
    headers: Record<string, string>,
  ): boolean {
    // Gmarket webhooks include a signature in the X-Gmarket-Signature
    // header. This adapter only checks that the header is present; it
    // does not verify the signature value.
    const sig = headers['x-gmarket-signature']
    if (!sig) return false
    return typeof sig === 'string' && sig.length > 0
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    const eventType = payload['eventType'] as string | undefined
    const resourceId = payload['resourceId'] as string | undefined

    let resourceType: WebhookEvent['resourceType'] = 'unknown'
    let action: WebhookEvent['action'] = 'unknown'

    if (eventType) {
      const lower = eventType.toLowerCase()
      if (lower.includes('product') || lower.includes('goods')) {
        resourceType = 'products'
      } else if (lower.includes('order')) {
        resourceType = 'orders'
      } else if (lower.includes('fulfillment') || lower.includes('shipment') || lower.includes('delivery')) {
        resourceType = 'fulfillments'
      }

      if (lower.includes('created') || lower.includes('new') || lower.includes('registered')) {
        action = 'created'
      } else if (lower.includes('updated') || lower.includes('changed') || lower.includes('modified')) {
        action = 'updated'
      } else if (lower.includes('deleted') || lower.includes('cancelled') || lower.includes('canceled')) {
        action = 'deleted'
      }
    }

    return [
      {
        id: (payload['eventId'] as string | undefined) ?? undefined,
        platform: 'gmarket',
        type: eventType ?? 'unknown',
        resourceType,
        action,
        resourceId: resourceId ?? 'unknown',
        payload,
      },
    ]
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): GmarketClient {
    return new GmarketClient(credentials)
  }

  // ── Products ──────────────────────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const client = this.clientFor(credentials)
    const pageSize = (params.limit as number | undefined) ?? DEFAULT_PAGE_SIZE
    const page = (params.page as number | undefined) ?? 1
    const res = await client.get<RawProductsEnvelope>(PRODUCTS_BASE, { page, pageSize })
    return (res.products ?? []).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.clientFor(credentials).get<RawGmarketProduct>(
      `${PRODUCTS_BASE}/${encodeURIComponent(id)}`,
    )
    if (!res.goodsNo) res.goodsNo = id
    return transformProduct(res)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const body = untransformProduct(data)
    const res = await this.clientFor(credentials).post<RawGmarketProduct>(PRODUCTS_BASE, body)
    return transformProduct(res)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const body = untransformProduct(data)
    const res = await this.clientFor(credentials).put<RawGmarketProduct>(
      `${PRODUCTS_BASE}/${encodeURIComponent(id)}`,
      body,
    )
    if (!res.goodsNo) res.goodsNo = id
    return transformProduct(res)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(
      `${PRODUCTS_BASE}/${encodeURIComponent(id)}`,
    )
  }

  // ── Inventory ─────────────────────────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const client = this.clientFor(credentials)
    const pageSize = (params.limit as number | undefined) ?? DEFAULT_PAGE_SIZE
    const page = (params.page as number | undefined) ?? 1
    const res = await client.get<RawInventoryEnvelope>(INVENTORY_BASE, { page, pageSize })
    return (res.items ?? []).map(transformInventoryLevel)
  }

  async getInventoryLevel(credentials: Credentials, id: string): Promise<InventoryLevel> {
    // Canonical id is `${goodsNo}:gmarket-default`; extract goodsNo.
    const goodsNo = id.includes(':') ? id.split(':')[0]! : id
    const res = await this.clientFor(credentials).get<RawGmarketInventoryItem>(
      `${INVENTORY_BASE}/${encodeURIComponent(goodsNo)}`,
    )
    if (!res.goodsNo) res.goodsNo = goodsNo
    return transformInventoryLevel(res)
  }

  async adjustInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; delta: number },
  ): Promise<InventoryLevel> {
    const goodsNo = data.variantId
    const client = this.clientFor(credentials)
    // Read current, apply delta, write back.
    const current = await client.get<RawGmarketInventoryItem>(
      `${INVENTORY_BASE}/${encodeURIComponent(goodsNo)}`,
    )
    if (!current.goodsNo) current.goodsNo = goodsNo
    const currentQty = current.stockQuantity ?? 0
    const newQty = Math.max(0, currentQty + data.delta)
    await client.put<unknown>(
      `${INVENTORY_BASE}/${encodeURIComponent(goodsNo)}`,
      { stockQuantity: newQty },
    )
    return {
      id: `${goodsNo}:${DEFAULT_LOCATION_ID}`,
      variantId: goodsNo,
      locationId: DEFAULT_LOCATION_ID,
      available: newQty,
      metadata: { ...current, stockQuantity: newQty } as unknown as Record<string, unknown>,
    }
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const goodsNo = data.variantId
    const client = this.clientFor(credentials)
    await client.put<unknown>(
      `${INVENTORY_BASE}/${encodeURIComponent(goodsNo)}`,
      { stockQuantity: data.available },
    )
    return {
      id: `${goodsNo}:${DEFAULT_LOCATION_ID}`,
      variantId: goodsNo,
      locationId: DEFAULT_LOCATION_ID,
      available: data.available,
      metadata: { goodsNo, stockQuantity: data.available },
    }
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = this.clientFor(credentials)
    const pageSize = (params.limit as number | undefined) ?? DEFAULT_PAGE_SIZE
    const page = (params.page as number | undefined) ?? 1
    const qp: Record<string, unknown> = { page, pageSize }
    const status = params['status'] as string | undefined
    if (status) qp['status'] = status
    const res = await client.get<RawOrdersEnvelope>(ORDERS_BASE, qp)
    return (res.orders ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const res = await this.clientFor(credentials).get<RawGmarketOrder>(
      `${ORDERS_BASE}/${encodeURIComponent(id)}`,
    )
    return transformOrder(res)
  }

  // ── Fulfillments ──────────────────────────────────────────────────────────

  async listFulfillments(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Fulfillment[]> {
    const orderNo = (params['orderId'] ?? params['order_id']) as string | undefined
    if (!orderNo) {
      throw new Error('Gmarket listFulfillments requires `orderId` in query params.')
    }
    const res = await this.clientFor(credentials).get<RawFulfillmentsEnvelope>(
      FULFILLMENTS_BASE,
      { orderNo },
    )
    return transformFulfillments(res.fulfillments)
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const res = await this.clientFor(credentials).get<RawGmarketFulfillment>(
      `${FULFILLMENTS_BASE}/${encodeURIComponent(id)}`,
    )
    return transformFulfillment(res)
  }

  async createFulfillment(
    credentials: Credentials,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    const orderNo = data.orderId
    if (!orderNo) {
      throw new Error('Gmarket createFulfillment requires `orderId`.')
    }
    const body = untransformFulfillment(data)
    const res = await this.clientFor(credentials).post<RawGmarketFulfillment>(
      FULFILLMENTS_BASE,
      body,
    )
    return transformFulfillment(res)
  }
}
