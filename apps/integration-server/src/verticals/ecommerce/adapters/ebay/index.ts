/**
 * eBay adapter for the ecommerce vertical.
 *
 * Maps eBay's REST APIs to the canonical ecommerce resources. eBay is a
 * marketplace platform (seller-scoped, many 501s, OAuth2 refresh).
 *
 * Slug: `ebay`
 * Platform identifier: `ebay`
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (31):
 *
 *   Products:     list, get, create, update, delete   (Inventory API)
 *   Variants:     list, get, create, update, delete   (Inventory API —
 *                 inventory_item scoped by inventory_item_group; see
 *                 transform/variant.ts for how this relates to Product)
 *   Locations:    list, get                           (Inventory API)
 *   Inventory:    list, get, adjust, set              (Inventory API quantity field)
 *   Orders:       list, get                           (Fulfillment API)
 *   Fulfillments: list, get, create                   (Fulfillment API)
 *   Refunds:      list, get, create                   (Fulfillment API issue_refund)
 *   Transactions: list, get                           (Finances API)
 *   Discounts:    list, get, create, update, delete   (Marketing API)
 *
 * Omitted (10) — the registry will return HTTP 501 automatically:
 *
 *   Collections (5) — eBay's Stores API has seller-managed store categories
 *                     (GET/POST /store/categories) but no endpoint lists a
 *                     category's products, and this adapter does not
 *                     implement the read side either (backlog).
 *   Customers (5)   — eBay does not expose a buyer/customer identity resource
 *                     to sellers; buyer info is embedded in orders only.
 *   createOrder, updateOrder, cancelOrder — buyers create orders.
 *   updateFulfillment, cancelFulfillment — eBay doesn't support these.
 *   createTransaction — eBay controls transactions.
 *
 * ── Resource coverage ──────────────────────────────────────────────────
 * Unavailable: customer — eBay does not expose a buyer/customer identity resource to sellers; buyer info is embedded in orders only.
 *
 * Webhooks: eBay Platform Notifications via HTTPS POST — verifier + parser
 * implemented.
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import { pageOffset, reportUpstreamPage } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product, ProductVariant } from '../../schema/product'
import type { Location } from '../../schema/location'
import type { InventoryLevel } from '../../schema/inventory'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Refund } from '../../schema/refund'
import type { Transaction } from '../../schema/transaction'
import type { Discount } from '../../schema/discount'
import type { WebhookEvent } from '../../schema/webhook'

import {
  buildAuthUrl,
  exchangeCode as ebayExchangeCode,
  refreshCredentials as ebayRefreshCredentials,
} from './auth'
import { EbayClient } from './client'
import {
  DEFAULT_ENVIRONMENT,
  DEFAULT_PAGE_SIZE,
  INVENTORY_BASE,
  INVENTORY_ITEM_GROUP_BASE,
  MAX_PAGE_SIZE,
  LOCATION_BASE,
  ORDER_BASE,
  FINANCES_BASE,
  MARKETING_PROMOTION_BASE,
  MARKETING_ITEM_PROMOTION_BASE,
} from './constants'
import {
  transformProduct,
  untransformProduct,
  type RawEbayInventoryItem,
} from './transform/product'
import {
  transformVariant,
  type RawEbayInventoryItemGroup,
} from './transform/variant'
import { transformLocation, type RawEbayLocation } from './transform/location'
import { transformInventoryLevel } from './transform/inventory'
import { transformOrder, type RawEbayOrder } from './transform/order'
import {
  transformFulfillment,
  transformFulfillments,
  untransformFulfillment,
  type RawEbayShippingFulfillment,
} from './transform/fulfillment'
import { transformRefund, untransformRefund, type RawEbayRefund } from './transform/refund'
import { transformTransaction, type RawEbayTransaction } from './transform/transaction'
import {
  transformPromotionDetail,
  transformItemPromotion,
  type RawEbayItemPromotion,
  type RawEbayPromotionDetail,
} from './transform/discount'

// ── Response envelopes ────────────────────────────────────────────────────────

interface RawInventoryItemsEnvelope {
  /** URI of the next page; eBay returns it only when one exists. */
  next?: string
  inventoryItems?: RawEbayInventoryItem[]
  total?: number
  size?: number
  offset?: number
  limit?: number
}

interface RawLocationsEnvelope {
  /** URI of the next page; eBay returns it only when one exists. */
  next?: string
  locations?: RawEbayLocation[]
  total?: number
  offset?: number
  limit?: number
}

interface RawOrdersEnvelope {
  /** URI of the next page; eBay returns it only when one exists. */
  next?: string
  orders?: RawEbayOrder[]
  total?: number
  offset?: number
  limit?: number
}

interface RawFulfillmentsEnvelope {
  fulfillments?: RawEbayShippingFulfillment[]
  total?: number
}

interface RawTransactionsEnvelope {
  /** URI of the next page; eBay returns it only when one exists. */
  next?: string
  transactions?: RawEbayTransaction[]
  total?: number
  offset?: number
  limit?: number
}

interface RawPromotionsEnvelope {
  /** URI of the next page; eBay returns it only when one exists. */
  next?: string
  promotions?: RawEbayPromotionDetail[]
  total?: number
  offset?: number
  limit?: number
}

/**
 * The `limit` to send: the caller's limit, clamped to 200. That is the
 * documented maximum for inventory_item, order and promotion (order errors
 * above it), the response-schema maximum for transaction, and the adapter's
 * cap for location, which documents none.
 */
function ebayPageSize(params: QueryParams): number {
  const asked = params.limit
  const limit =
    typeof asked === 'number' && Number.isFinite(asked) && asked >= 1
      ? Math.floor(asked)
      : DEFAULT_PAGE_SIZE
  return Math.min(limit, MAX_PAGE_SIZE)
}

/**
 * Report one eBay page. `next` is returned only when another page exists, so
 * its absence is the end; `total` is the number of matching records. A size
 * clamped below the caller's limit is reported so the router judges the page
 * against the size actually sent.
 */
function reportEbayPage(
  params: QueryParams,
  size: number,
  res: { next?: string; total?: number } | null | undefined,
): void {
  reportUpstreamPage(params, {
    hasMore: typeof res?.next === 'string' && res.next.length > 0,
    ...(typeof res?.total === 'number' ? { totalCount: res.total } : {}),
    ...(typeof params.limit === 'number' && size < params.limit ? { pageSize: size } : {}),
  })
}

export interface EbayAdapterConfig {
  /** eBay app client id. Optional — may come from credentials. */
  clientId?: string
  /** eBay app client secret. Optional — may come from credentials. */
  clientSecret?: string
  /** Default environment: 'production' | 'sandbox'. */
  environment?: 'production' | 'sandbox'
  /** Default OAuth2 redirect URI. */
  redirectUri?: string
}

export class EbayAdapter implements EcommerceAdapter {
  readonly platform = 'ebay'
  readonly version = '0.1.0'

  private configClientId: string | undefined
  private configClientSecret: string | undefined
  private configEnvironment: string
  private configRedirectUri: string | undefined

  constructor(config: EbayAdapterConfig = {}) {
    this.configClientId = config.clientId
    this.configClientSecret = config.clientSecret
    this.configEnvironment = config.environment ?? DEFAULT_ENVIRONMENT
    this.configRedirectUri = config.redirectUri
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    const clientId = this.configClientId
    if (!clientId) {
      throw new Error(
        'eBay adapter getAuthUrl requires clientId — configure it in ' +
          'apps/integration-server/config/config.yml under adapters.ebay.',
      )
    }
    const redirectUri = this.configRedirectUri ?? ''
    return buildAuthUrl(clientId, redirectUri, state, overrideScopes)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    const clientId = this.configClientId
    const clientSecret = this.configClientSecret
    if (!clientId || !clientSecret) {
      throw new Error(
        'eBay adapter exchangeCode requires clientId and clientSecret — configure them in ' +
          'apps/integration-server/config/config.yml under adapters.ebay.',
      )
    }
    return ebayExchangeCode(code, redirectUri, clientId, clientSecret, this.configEnvironment)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return ebayRefreshCredentials(credentials)
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  verifyWebhookSignature(payload: Record<string, unknown>, headers: Record<string, string>): boolean {
    // eBay Platform Notifications include a signature in the
    // X-EBAY-SIGNATURE header.
    const sig = headers['x-ebay-signature']
    if (!sig) return false
    // Full verification requires the endpoint-specific verification token
    // and public key; this adapter only checks that a signature header is
    // present.
    return typeof sig === 'string' && sig.length > 0
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    const topic = (payload['metadata'] as Record<string, unknown> | undefined)?.['topic'] as string | undefined
    const resourceId = (payload['resource'] as Record<string, unknown> | undefined)?.['resourceId'] as string | undefined

    let resourceType: WebhookEvent['resourceType'] = 'unknown'
    let action: WebhookEvent['action'] = 'unknown'

    if (topic) {
      const lower = topic.toLowerCase()
      if (lower.includes('item')) {
        resourceType = 'products'
      } else if (lower.includes('order')) {
        resourceType = 'orders'
      } else if (lower.includes('fulfillment') || lower.includes('shipment')) {
        resourceType = 'fulfillments'
      }

      if (lower.includes('created') || lower.includes('new')) {
        action = 'created'
      } else if (lower.includes('updated') || lower.includes('changed')) {
        action = 'updated'
      } else if (lower.includes('deleted') || lower.includes('cancelled')) {
        action = 'deleted'
      }
    }

    return [
      {
        id: (payload['notificationId'] as string | undefined) ?? undefined,
        platform: 'ebay',
        type: topic ?? 'unknown',
        resourceType,
        action,
        resourceId: resourceId ?? 'unknown',
        payload,
      },
    ]
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): EbayClient {
    return new EbayClient(credentials)
  }

  /**
   * One page of GET /sell/inventory/v1/inventory_item. Its `offset` is a
   * 0-based PAGE INDEX, not a record offset: "sets the page number to
   * retrieve. The first page of records has a value of `0`, the second page
   * of records has a value of `1`" (Sell Inventory API, getInventoryItems).
   */
  private async inventoryItemsPage(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<RawEbayInventoryItem[]> {
    const limit = ebayPageSize(params)
    // 0-based page index = rows skipped at a page size of one.
    const offset = pageOffset(params, 1)
    const res = await this.clientFor(credentials).get<RawInventoryItemsEnvelope>(INVENTORY_BASE, {
      limit,
      offset,
    })
    reportEbayPage(params, limit, res)
    return res?.inventoryItems ?? []
  }

  // ── Products (Inventory API) ──────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    return (await this.inventoryItemsPage(credentials, params)).map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.clientFor(credentials).get<RawEbayInventoryItem>(
      `${INVENTORY_BASE}/${encodeURIComponent(id)}`,
    )
    // eBay doesn't include SKU in the GET response body — inject it.
    if (!res.sku) res.sku = id
    return transformProduct(res)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const sku = data.id
    if (!sku) {
      throw new Error('eBay createProduct requires `id` (the SKU).')
    }
    await this.clientFor(credentials).put<unknown>(
      `${INVENTORY_BASE}/${encodeURIComponent(sku)}`,
      untransformProduct(data),
    )
    return this.getProduct(credentials, sku)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    // eBay's PUT is an upsert — same endpoint for create and update.
    await this.clientFor(credentials).put<unknown>(
      `${INVENTORY_BASE}/${encodeURIComponent(id)}`,
      untransformProduct(data),
    )
    return this.getProduct(credentials, id)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(
      `${INVENTORY_BASE}/${encodeURIComponent(id)}`,
    )
  }

  // ── Variants (Inventory API — inventory_item scoped by inventory_item_group) ─
  //
  // See transform/variant.ts for how this relates to Product: both map the
  // same underlying `inventory_item` entity; Variant additionally requires
  // and maintains group membership (`inventory_item_group.variantSKUs`).

  async listVariants(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<ProductVariant[]> {
    const productId = (params['productId'] ?? params['product_id']) as string | undefined
    if (!productId) {
      throw Object.assign(
        new Error(
          'eBay listVariants requires `productId` (the inventoryItemGroupKey) in query params.',
        ),
        { statusCode: 400 },
      )
    }
    const client = this.clientFor(credentials)
    const group = await client.get<RawEbayInventoryItemGroup>(
      `${INVENTORY_ITEM_GROUP_BASE}/${encodeURIComponent(productId)}`,
    )
    const skus = group.variantSKUs ?? []
    const items = await Promise.all(
      skus.map(async (sku) => {
        const item = await client.get<RawEbayInventoryItem>(
          `${INVENTORY_BASE}/${encodeURIComponent(sku)}`,
        )
        if (!item.sku) item.sku = sku
        return item
      }),
    )
    return items.map((item) => transformVariant(item, productId))
  }

  async getVariant(credentials: Credentials, id: string): Promise<ProductVariant> {
    const res = await this.clientFor(credentials).get<RawEbayInventoryItem>(
      `${INVENTORY_BASE}/${encodeURIComponent(id)}`,
    )
    if (!res.sku) res.sku = id
    // No group key was supplied by a caller here (unlike listVariants) — let
    // transformVariant fall back to the item's own inventoryItemGroupKeys.
    return transformVariant(res)
  }

  async createVariant(
    credentials: Credentials,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    const productId = data.productId
    const sku = data.sku ?? data.id
    if (!productId) {
      throw Object.assign(
        new Error('eBay createVariant requires `productId` (the inventoryItemGroupKey).'),
        { statusCode: 400 },
      )
    }
    if (!sku) {
      throw Object.assign(new Error('eBay createVariant requires `sku`.'), {
        statusCode: 400,
      })
    }
    const client = this.clientFor(credentials)
    // Create (or upsert) the SKU's inventory item — same write eBay uses
    // for a standalone Product.
    await client.put<unknown>(
      `${INVENTORY_BASE}/${encodeURIComponent(sku)}`,
      untransformProduct(data),
    )
    // Add it to the group's membership so it is a variant, not a bare item.
    const group = await client.get<RawEbayInventoryItemGroup>(
      `${INVENTORY_ITEM_GROUP_BASE}/${encodeURIComponent(productId)}`,
    )
    const variantSKUs = group.variantSKUs ?? []
    if (!variantSKUs.includes(sku)) {
      await client.put<unknown>(
        `${INVENTORY_ITEM_GROUP_BASE}/${encodeURIComponent(productId)}`,
        { ...group, variantSKUs: [...variantSKUs, sku] },
      )
    }
    return this.getVariant(credentials, sku)
  }

  async updateVariant(
    credentials: Credentials,
    id: string,
    data: Partial<ProductVariant>,
  ): Promise<ProductVariant> {
    // eBay's PUT on inventory_item is an upsert — same endpoint update uses
    // to modify a standalone Product.
    await this.clientFor(credentials).put<unknown>(
      `${INVENTORY_BASE}/${encodeURIComponent(id)}`,
      untransformProduct(data),
    )
    return this.getVariant(credentials, id)
  }

  async deleteVariant(credentials: Credentials, id: string): Promise<void> {
    const client = this.clientFor(credentials)
    // Learn the item's group (deleteVariant only receives the SKU) so its
    // membership can be dropped before the item itself is removed.
    const item = await client.get<RawEbayInventoryItem>(
      `${INVENTORY_BASE}/${encodeURIComponent(id)}`,
    )
    const groupKey = item.inventoryItemGroupKeys?.[0]
    if (groupKey) {
      const group = await client.get<RawEbayInventoryItemGroup>(
        `${INVENTORY_ITEM_GROUP_BASE}/${encodeURIComponent(groupKey)}`,
      )
      const remaining = (group.variantSKUs ?? []).filter((sku) => sku !== id)
      await client.put<unknown>(
        `${INVENTORY_ITEM_GROUP_BASE}/${encodeURIComponent(groupKey)}`,
        { ...group, variantSKUs: remaining },
      )
    }
    await client.delete(`${INVENTORY_BASE}/${encodeURIComponent(id)}`)
  }

  // ── Locations (Inventory API) ──────────────────────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const client = this.clientFor(credentials)
    // `offset` here is a record offset ("the number of locations to skip").
    const limit = ebayPageSize(params)
    const offset = pageOffset(params, limit)
    const res = await client.get<RawLocationsEnvelope>(LOCATION_BASE, { limit, offset })
    reportEbayPage(params, limit, res)
    return (res?.locations ?? []).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const res = await this.clientFor(credentials).get<RawEbayLocation>(
      `${LOCATION_BASE}/${encodeURIComponent(id)}`,
    )
    if (!res.merchantLocationKey) res.merchantLocationKey = id
    return transformLocation(res)
  }

  // ── Inventory (Inventory API — quantity on inventory item) ─────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    return (await this.inventoryItemsPage(credentials, params)).map(transformInventoryLevel)
  }

  async getInventoryLevel(credentials: Credentials, id: string): Promise<InventoryLevel> {
    // Canonical id is `${sku}:ebay-default`; extract the SKU.
    const sku = id.includes(':') ? id.split(':')[0]! : id
    const res = await this.clientFor(credentials).get<RawEbayInventoryItem>(
      `${INVENTORY_BASE}/${encodeURIComponent(sku)}`,
    )
    if (!res.sku) res.sku = sku
    return transformInventoryLevel(res)
  }

  async adjustInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; delta: number },
  ): Promise<InventoryLevel> {
    const sku = data.variantId
    const client = this.clientFor(credentials)
    // Read current, apply delta, write back.
    const current = await client.get<RawEbayInventoryItem>(
      `${INVENTORY_BASE}/${encodeURIComponent(sku)}`,
    )
    if (!current.sku) current.sku = sku
    const currentQty = current.availability?.shipToLocationAvailability?.quantity ?? 0
    const newQty = Math.max(0, currentQty + data.delta)
    const body = {
      ...current,
      availability: {
        ...current.availability,
        shipToLocationAvailability: {
          ...current.availability?.shipToLocationAvailability,
          quantity: newQty,
        },
      },
    }
    await client.put<unknown>(
      `${INVENTORY_BASE}/${encodeURIComponent(sku)}`,
      body,
    )
    return this.getInventoryLevel(credentials, sku)
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const sku = data.variantId
    const client = this.clientFor(credentials)
    const current = await client.get<RawEbayInventoryItem>(
      `${INVENTORY_BASE}/${encodeURIComponent(sku)}`,
    )
    if (!current.sku) current.sku = sku
    const body = {
      ...current,
      availability: {
        ...current.availability,
        shipToLocationAvailability: {
          ...current.availability?.shipToLocationAvailability,
          quantity: data.available,
        },
      },
    }
    await client.put<unknown>(
      `${INVENTORY_BASE}/${encodeURIComponent(sku)}`,
      body,
    )
    return this.getInventoryLevel(credentials, sku)
  }

  // ── Orders (Fulfillment API) ──────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = this.clientFor(credentials)
    // Record offset; "If a requested limit is more than 200, the call fails".
    const limit = ebayPageSize(params)
    const offset = pageOffset(params, limit)
    const qp: Record<string, unknown> = { limit, offset }
    // eBay supports filter query string for date ranges, status, etc.
    const filter = params['filter'] as string | undefined
    if (filter) qp['filter'] = filter
    const res = await client.get<RawOrdersEnvelope>(ORDER_BASE, qp)
    reportEbayPage(params, limit, res)
    return (res?.orders ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const res = await this.clientFor(credentials).get<RawEbayOrder>(
      `${ORDER_BASE}/${encodeURIComponent(id)}`,
    )
    return transformOrder(res)
  }

  // ── Fulfillments (Fulfillment API) ────────────────────────────────────────

  async listFulfillments(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Fulfillment[]> {
    const orderId = (params['orderId'] ?? params['order_id']) as string | undefined
    if (!orderId) {
      throw new Error('eBay listFulfillments requires `orderId` in query params.')
    }
    const res = await this.clientFor(credentials).get<RawFulfillmentsEnvelope>(
      `${ORDER_BASE}/${encodeURIComponent(orderId)}/shipping_fulfillment`,
    )
    return transformFulfillments(orderId, res.fulfillments)
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    // Fulfillment id may be composite `${orderId}:${fulfillmentId}` or plain.
    // We need the orderId to construct the URL.
    const parts = id.split(':')
    let orderId: string
    let fulfillmentId: string
    if (parts.length >= 2) {
      orderId = parts[0]!
      fulfillmentId = parts[1]!
    } else {
      throw new Error(
        'eBay getFulfillment requires id formatted as `orderId:fulfillmentId`',
      )
    }
    const res = await this.clientFor(credentials).get<RawEbayShippingFulfillment>(
      `${ORDER_BASE}/${encodeURIComponent(orderId)}/shipping_fulfillment/${encodeURIComponent(fulfillmentId)}`,
    )
    return transformFulfillment(orderId, res)
  }

  async createFulfillment(
    credentials: Credentials,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    const orderId = data.orderId
    if (!orderId) {
      throw new Error('eBay createFulfillment requires `orderId`.')
    }
    const body = untransformFulfillment(data)
    const res = await this.clientFor(credentials).post<{ fulfillmentId: string }>(
      `${ORDER_BASE}/${encodeURIComponent(orderId)}/shipping_fulfillment`,
      body,
    )
    const fulfillmentId = res.fulfillmentId
    const created = await this.clientFor(credentials).get<RawEbayShippingFulfillment>(
      `${ORDER_BASE}/${encodeURIComponent(orderId)}/shipping_fulfillment/${encodeURIComponent(fulfillmentId)}`,
    )
    return transformFulfillment(orderId, created)
  }

  // ── Refunds (Fulfillment API issue_refund) ────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    // eBay doesn't have a standalone list-refunds endpoint. Derive from
    // order data — get the order and check for refund amounts, returning
    // a single refund if the order has been refunded.
    const orderId = (params['orderId'] ?? params['order_id']) as string | undefined
    if (!orderId) {
      throw new Error('eBay listRefunds requires `orderId` in query params.')
    }
    const order = await this.clientFor(credentials).get<RawEbayOrder>(
      `${ORDER_BASE}/${encodeURIComponent(orderId)}`,
    )
    // Check if order has any refund info
    const paymentStatus = order.orderPaymentStatus
    if (paymentStatus === 'PARTIALLY_REFUNDED' || paymentStatus === 'FULLY_REFUNDED') {
      const refundAmount = (order.pricingSummary as Record<string, unknown> | undefined)?.['totalDueSeller'] as
        | { value: string; currency: string }
        | undefined
      const rawRefund: RawEbayRefund = {
        orderId,
        refundAmount: refundAmount
          ? { value: refundAmount.value, currency: refundAmount.currency }
          : undefined,
        refundDate: order.lastModifiedDate,
        refundStatus: paymentStatus,
      }
      return [transformRefund(rawRefund)]
    }
    return []
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    // Refund id is `${orderId}:refund`. Extract orderId and list.
    const [orderId] = id.split(':')
    if (!orderId) {
      throw new Error('eBay refund id must contain an orderId')
    }
    const refunds = await this.listRefunds(credentials, { orderId } as QueryParams)
    const found = refunds.find((r) => r.id === id)
    if (!found) {
      throw new Error(`eBay getRefund: no refund found matching id '${id}'`)
    }
    return found
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const orderId = data.orderId
    if (!orderId) {
      throw new Error('eBay createRefund requires `orderId`.')
    }
    const body = untransformRefund(data)
    const res = await this.clientFor(credentials).post<Record<string, unknown>>(
      `${ORDER_BASE}/${encodeURIComponent(orderId)}/issue_refund`,
      body,
    )
    const refundId = (res['refundId'] as string | undefined) ?? `${orderId}:refund`
    return {
      id: refundId,
      orderId,
      amount: data.amount ? { amount: data.amount.amount, currency: data.amount.currency } : undefined,
      reason: data.reason,
      note: data.note,
      processedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      metadata: res,
    }
  }

  // ── Transactions (Finances API) ───────────────────────────────────────────

  async listTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Transaction[]> {
    const client = this.clientFor(credentials)
    // Record offset. The request `limit` documents 1000 but the Transactions
    // response schema 200; 200 satisfies both.
    const limit = ebayPageSize(params)
    const offset = pageOffset(params, limit)
    const qp: Record<string, unknown> = { limit, offset }
    const filter = params['filter'] as string | undefined
    if (filter) qp['filter'] = filter
    const res = await client.get<RawTransactionsEnvelope>(FINANCES_BASE, qp)
    // 204 No Content (nothing matches) has no body: no next, so the end.
    reportEbayPage(params, limit, res)
    return (res?.transactions ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    // eBay Finances API doesn't have a direct get-by-id endpoint.
    // Filter the list by transactionId.
    const client = this.clientFor(credentials)
    const res = await client.get<RawTransactionsEnvelope>(FINANCES_BASE, {
      filter: `transactionId:{${id}}`,
      limit: 1,
    })
    const tx = res.transactions?.[0]
    if (!tx) {
      throw new Error(`eBay getTransaction: no transaction found for id '${id}'`)
    }
    return transformTransaction(tx)
  }

  // ── Discounts (Marketing API) ──────────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const client = this.clientFor(credentials)
    // Record offset ("the number of discounts to skip"), limit maximum 200.
    const limit = ebayPageSize(params)
    const offset = pageOffset(params, limit)
    // marketplace_id is required by the eBay Marketing API; default to EBAY_US.
    const marketplaceId = (params['marketplaceId'] as string | undefined) ?? 'EBAY_US'
    const res = await client.get<RawPromotionsEnvelope>(MARKETING_PROMOTION_BASE, {
      limit,
      offset,
      marketplace_id: marketplaceId,
    })
    reportEbayPage(params, limit, res)
    return (res?.promotions ?? []).map(transformPromotionDetail)
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    // Use the item_promotion endpoint for the full shape (includes discountRules).
    const res = await this.clientFor(credentials).get<RawEbayItemPromotion>(
      `${MARKETING_ITEM_PROMOTION_BASE}/${encodeURIComponent(id)}`,
    )
    return transformItemPromotion(res)
  }

  async createDiscount(credentials: Credentials, data: Partial<Discount>): Promise<Discount> {
    const body: Record<string, unknown> = {}
    if (data.title) body['name'] = data.title
    if (data.startsAt) body['startDate'] = data.startsAt
    if (data.endsAt) body['endDate'] = data.endsAt
    if (data.code) body['couponCode'] = data.code
    // Default to ORDER_DISCOUNT; caller can override via metadata.promotionType.
    body['promotionType'] =
      (data.metadata?.['promotionType'] as string | undefined) ?? 'ORDER_DISCOUNT'
    body['marketplaceId'] =
      (data.metadata?.['marketplaceId'] as string | undefined) ?? 'EBAY_US'
    const res = await this.clientFor(credentials).post<{ promotionId?: string }>(
      MARKETING_ITEM_PROMOTION_BASE,
      body,
    )
    const createdId = res.promotionId
    if (!createdId) {
      throw new Error('eBay createDiscount: no promotionId returned from Marketing API')
    }
    return this.getDiscount(credentials, createdId)
  }

  async updateDiscount(
    credentials: Credentials,
    id: string,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const body: Record<string, unknown> = {}
    if (data.title) body['name'] = data.title
    if (data.startsAt) body['startDate'] = data.startsAt
    if (data.endsAt) body['endDate'] = data.endsAt
    if (data.code) body['couponCode'] = data.code
    await this.clientFor(credentials).put<unknown>(
      `${MARKETING_ITEM_PROMOTION_BASE}/${encodeURIComponent(id)}`,
      body,
    )
    return this.getDiscount(credentials, id)
  }

  async deleteDiscount(credentials: Credentials, id: string): Promise<void> {
    await this.clientFor(credentials).delete(
      `${MARKETING_ITEM_PROMOTION_BASE}/${encodeURIComponent(id)}`,
    )
  }
}
