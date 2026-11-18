/**
 * Amazon Selling Partner API (SP-API) adapter for the ecommerce vertical.
 *
 * Maps Amazon's SP-API to the canonical ecommerce resources. This is the
 * first marketplace (vs. true ecommerce platform) adapter, and also the
 * first adapter where a large slice of the canonical surface is not
 * expressible on the underlying platform — see "Coverage" below.
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (19):
 *
 *   Products:    list, get, create, update, delete   (Listings Items API)
 *   Inventory:   listInventoryLevels, getInventoryLevel (FBA Inventory API)
 *   Orders:      list, get                           (Orders API + OrderItems hydrate)
 *   Fulfillments: list, get                          (projected from OrderItems)
 *   Refunds:     list, get                           (Finances RefundEventList)
 *   Transactions: list, get                          (Finances FinancialEvents)
 *   Locations:   list, get                           (Supply Sources API v2020-07-01)
 *
 * Omitted (23) — the registry will return HTTP 501 automatically:
 *
 *   Variants (5)   — Amazon has no variant-as-resource concept.
 *   Collections (5) — browse nodes are system-controlled, not user-mutable.
 *   Customers (5)  — no customer resource; buyer info is PII-gated per order.
 *   Discounts (5)  — SP-API's Promotions API is read-only (search/get);
 *                    no create/update/delete endpoint exists, and this
 *                    adapter does not implement the read side either (backlog).
 *   Inventory mutations (2) — adjust/set: Amazon controls FBA counts.
 *   Order mutations (3)     — create/update/cancel: merchants don't create
 *                             orders; cancellations/updates go through the
 *                             async Feeds API, which this adapter does not
 *                             implement.
 *   Fulfillment mutations (3) — create/update/cancel: same Feeds API reason.
 *   createRefund + createTransaction — Amazon controls refunds and captures.
 *
 * Webhooks: SP-API Notifications deliver to SQS or EventBridge, not plain
 * HTTP. There is no HTTP payload to verify or parse, so the webhook
 * verifier / parser are omitted (501).
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * Unavailable: collection — browse nodes are system-controlled taxonomy, not user-mutable resources
 * Unavailable: customer  — no customer resource in SP-API; buyer PII is gated per-order via Restricted Data Tokens
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { InventoryLevel } from '../../schema/inventory'
import type { Location } from '../../schema/location'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Refund } from '../../schema/refund'
import type { Transaction } from '../../schema/transaction'

import {
  buildAuthUrl,
  exchangeCode as amazonExchangeCode,
  refreshCredentials as amazonRefreshCredentials,
} from './auth'
import { AmazonSPClient } from './client'
import {
  CATALOG_BASE as _CATALOG_BASE,
  DEFAULT_PAGE_SIZE,
  DEFAULT_REGION,
  FBA_INVENTORY_BASE,
  FINANCES_BASE,
  FINANCES_ORDER_EVENTS_BASE,
  LISTINGS_BASE,
  ORDERS_BASE,
  REGIONS,
  SUPPLY_SOURCES_BASE,
} from './constants'
import {
  transformProduct,
  untransformProduct,
  type RawAmazonListingsItem,
} from './transform/product'
import {
  transformOrder,
  type RawAmazonOrder,
  type RawAmazonOrderItem,
} from './transform/order'
import {
  transformFulfillment,
  transformFulfillments,
} from './transform/fulfillment'
import {
  transformRefund,
  type RawAmazonRefundEvent,
} from './transform/refund'
import {
  transformTransaction,
  type AmazonFinancialEventType,
  type RawAmazonFinancialEvent,
} from './transform/transaction'
import {
  transformInventoryLevel,
  type RawFBAInventorySummary,
} from './transform/inventory'
import {
  transformLocation,
  type RawSupplySource,
  type RawGetSupplySourcesResponse,
} from './transform/location'

// Silence an eslint unused-import warning — CATALOG_BASE is re-exported
// for completeness and may be used by tests or a future Catalog-based
// fallback in `listProducts`.
void _CATALOG_BASE

export interface AmazonSPAdapterConfig {
  /** LWA application client id (`amzn1.application-oa2-client.…`). Optional — may come from credentials. */
  clientId?: string
  /** LWA application client secret. Optional — may come from credentials. */
  clientSecret?: string
  /** Default region when credentials do not specify one. */
  region?: 'na' | 'eu' | 'fe'
}

/**
 * Shape of the inventory summaries envelope returned by the FBA
 * Inventory API. Declared locally because it's only used by this
 * adapter class.
 */
interface RawFBAInventoryEnvelope {
  payload?: {
    granularity?: { granularityType?: string; granularityId?: string }
    inventorySummaries?: RawFBAInventorySummary[]
  }
}

interface RawOrdersEnvelope {
  payload?: {
    Orders?: RawAmazonOrder[]
    NextToken?: string
    LastUpdatedBefore?: string
    CreatedBefore?: string
  }
}

interface RawOrderEnvelope {
  payload?: RawAmazonOrder
}

interface RawOrderItemsEnvelope {
  payload?: {
    AmazonOrderId?: string
    OrderItems?: RawAmazonOrderItem[]
    NextToken?: string
  }
}

interface RawFinancialEventsEnvelope {
  payload?: {
    FinancialEvents?: {
      ShipmentEventList?: Array<Record<string, unknown>>
      RefundEventList?: Array<Record<string, unknown>>
      AdjustmentEventList?: Array<Record<string, unknown>>
      SellerReviewEnrollmentPaymentEventList?: Array<Record<string, unknown>>
      GuaranteeClaimEventList?: Array<Record<string, unknown>>
      ChargebackEventList?: Array<Record<string, unknown>>
      ServiceFeeEventList?: Array<Record<string, unknown>>
    }
    NextToken?: string
  }
}

export class AmazonSPAdapter implements EcommerceAdapter {
  readonly platform = 'amazon-sp'
  readonly version = '0.1.0'

  private configClientId: string | undefined
  private configClientSecret: string | undefined
  private configRegion: string

  constructor(config: AmazonSPAdapterConfig = {}) {
    this.configClientId = config.clientId
    this.configClientSecret = config.clientSecret
    this.configRegion = config.region ?? DEFAULT_REGION
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // Amazon's install flow starts in Seller Central — the state param is
    // unused because we are not the authoriser.
    return buildAuthUrl()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    // See ./auth.ts for the full rationale: Amazon hands out long-lived
    // refresh tokens out-of-band. Callers POST them to /v1/connections.
    return amazonExchangeCode()
  }

  /**
   * Refresh credentials by calling the LWA token endpoint. This is the
   * actual auth implementation for Amazon — `exchangeCode` is a
   * placeholder that throws.
   */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return amazonRefreshCredentials(credentials)
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────
  //
  // Intentionally omitted. SP-API Notifications are delivered via SQS /
  // EventBridge rather than HTTP POST; there is no signature to verify
  // from the Fastify side, and the webhook route is simply not exposed.

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): AmazonSPClient {
    const clientId =
      (credentials.extra?.['clientId'] as string | undefined) ?? this.configClientId
    const clientSecret =
      (credentials.extra?.['clientSecret'] as string | undefined) ?? this.configClientSecret
    const region =
      (credentials.extra?.['region'] as string | undefined) ?? this.configRegion
    if (!clientId || !clientSecret) {
      throw new Error(
        'Amazon SP-API adapter is missing clientId/clientSecret — either configure them ' +
          'in apps/integration-server/config/config.yml under adapters.amazon-sp, or POST them to ' +
          '/v1/connections with credentials: {clientId, clientSecret, refreshToken, region, sellerId}.',
      )
    }
    if (!REGIONS[region]) {
      throw new Error(
        `Amazon SP-API adapter: unknown region '${region}'. Valid: ${Object.keys(REGIONS).join(', ')}.`,
      )
    }
    const merged: Credentials = {
      ...credentials,
      extra: {
        ...credentials.extra,
        clientId,
        clientSecret,
        region,
      },
    }
    return new AmazonSPClient(merged)
  }

  private sellerIdFor(credentials: Credentials): string {
    const sellerId = credentials.extra?.['sellerId'] as string | undefined
    if (!sellerId) {
      throw new Error(
        'Amazon SP-API requires `sellerId` in credentials.extra — add it when POSTing to /v1/connections.',
      )
    }
    return sellerId
  }

  private marketplaceIdsFor(credentials: Credentials, params: QueryParams): string {
    // Prefer an explicit per-request override, then credentials.extra,
    // then the single US marketplace default. Multiple ids are comma-
    // separated per the SP-API spec.
    const fromParams = (params['marketplaceIds'] ?? params['marketplace_ids']) as
      | string
      | string[]
      | undefined
    if (fromParams) {
      return Array.isArray(fromParams) ? fromParams.join(',') : String(fromParams)
    }
    const fromExtra = credentials.extra?.['marketplaceIds']
    if (fromExtra) {
      return Array.isArray(fromExtra) ? fromExtra.join(',') : String(fromExtra)
    }
    // ATVPDKIKX0DER is the US marketplace id — a safe default for the
    // default `na` region.
    return 'ATVPDKIKX0DER'
  }

  // ── Products (Listings Items API) ─────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const sellerId = this.sellerIdFor(credentials)
    const client = this.clientFor(credentials)
    const res = await client.listWithToken<RawAmazonListingsItem>(
      `${LISTINGS_BASE}/${encodeURIComponent(sellerId)}`,
      'items',
      {
        marketplaceIds: this.marketplaceIdsFor(credentials, params),
        includedData: 'summaries,attributes,images',
        pageSize: params.limit ?? DEFAULT_PAGE_SIZE,
        ...(params['cursor'] ? { cursor: params['cursor'] } : {}),
      },
    )
    return res.items.map((it) => transformProduct(it))
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const sellerId = this.sellerIdFor(credentials)
    const marketplaceIds = this.marketplaceIdsFor(credentials, {} as QueryParams)
    const res = await this.clientFor(credentials).get<RawAmazonListingsItem>(
      `${LISTINGS_BASE}/${encodeURIComponent(sellerId)}/${encodeURIComponent(id)}`,
      {
        marketplaceIds,
        includedData: 'summaries,attributes,images',
      },
    )
    return transformProduct(res)
  }

  async createProduct(
    credentials: Credentials,
    data: Partial<Product>,
  ): Promise<Product> {
    const sellerId = this.sellerIdFor(credentials)
    const marketplaceIds = this.marketplaceIdsFor(credentials, {} as QueryParams)
    const sku = data.id
    if (!sku) {
      throw new Error('Amazon createProduct requires `id` (the SKU).')
    }
    await this.clientFor(credentials).put<unknown>(
      `${LISTINGS_BASE}/${encodeURIComponent(sellerId)}/${encodeURIComponent(sku)}?marketplaceIds=${encodeURIComponent(marketplaceIds)}`,
      untransformProduct(data),
    )
    // Amazon's PUT is async — it returns a submission id, not the full
    // listing. Re-fetch to return the canonical shape.
    return this.getProduct(credentials, sku)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const sellerId = this.sellerIdFor(credentials)
    const marketplaceIds = this.marketplaceIdsFor(credentials, {} as QueryParams)
    // Use PATCH with the Listings patch operations schema. The adapter
    // replaces the attributes bag wholesale — callers needing granular
    // JSON Patch ops can pass them via metadata.operations.
    const ops =
      (data.metadata?.['operations'] as unknown[] | undefined) ??
      [
        {
          op: 'replace',
          path: '/attributes',
          value:
            (data.metadata?.['attributes'] as Record<string, unknown> | undefined) ?? {
              item_name: data.title ? [{ value: data.title }] : [],
            },
        },
      ]
    await this.clientFor(credentials).patch<unknown>(
      `${LISTINGS_BASE}/${encodeURIComponent(sellerId)}/${encodeURIComponent(id)}?marketplaceIds=${encodeURIComponent(marketplaceIds)}`,
      {
        productType:
          (data.metadata?.['productType'] as string | undefined) ?? data.productType ?? 'PRODUCT',
        patches: ops,
      },
    )
    return this.getProduct(credentials, id)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    const sellerId = this.sellerIdFor(credentials)
    const marketplaceIds = this.marketplaceIdsFor(credentials, {} as QueryParams)
    await this.clientFor(credentials).delete(
      `${LISTINGS_BASE}/${encodeURIComponent(sellerId)}/${encodeURIComponent(id)}`,
      { marketplaceIds },
    )
  }

  // ── Inventory (FBA Inventory API) ─────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const marketplaceIds = this.marketplaceIdsFor(credentials, params)
    const req: Record<string, unknown> = {
      details: true,
      granularityType: 'Marketplace',
      granularityId: marketplaceIds.split(',')[0],
      marketplaceIds,
    }
    const sellerSkus = (params['sellerSkus'] ?? params['seller_skus']) as
      | string
      | string[]
      | undefined
    if (sellerSkus) {
      req['sellerSkus'] = Array.isArray(sellerSkus) ? sellerSkus.join(',') : sellerSkus
    }
    const res = await this.clientFor(credentials).get<RawFBAInventoryEnvelope>(
      FBA_INVENTORY_BASE,
      req,
    )
    const summaries = res.payload?.inventorySummaries ?? []
    return summaries.map(transformInventoryLevel)
  }

  async getInventoryLevel(
    credentials: Credentials,
    id: string,
  ): Promise<InventoryLevel> {
    // Canonical ids for Amazon inventory are `${sku}:${locationId}`. We
    // only support the `fba-default` synthetic location, so the caller
    // may pass either the bare SKU or the composite.
    const sku = id.includes(':') ? id.split(':')[0]! : id
    const levels = await this.listInventoryLevels(credentials, {
      sellerSkus: sku,
    } as QueryParams)
    const found = levels.find((l) => l.variantId === sku)
    if (!found) {
      throw new Error(`Amazon getInventoryLevel: no FBA summary found for SKU '${sku}'`)
    }
    return found
  }

  // ── Locations (Supply Sources API v2020-07-01) ────────────────────────────

  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const req: Record<string, unknown> = {
      pageSize: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    if (params['cursor']) {
      req['nextPageToken'] = params['cursor']
    }
    const res = await this.clientFor(credentials).get<RawGetSupplySourcesResponse>(
      SUPPLY_SOURCES_BASE,
      req,
    )
    return (res.supplySources ?? []).map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const res = await this.clientFor(credentials).get<RawSupplySource>(
      `${SUPPLY_SOURCES_BASE}/${encodeURIComponent(id)}`,
    )
    return transformLocation(res)
  }

  // ── Orders (Orders API) ───────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const marketplaceIds = this.marketplaceIdsFor(credentials, params)
    const createdAfter =
      params.updatedAfter?.toISOString() ??
      (params['createdAfter'] as string | undefined) ??
      // Default to a 30-day lookback — Amazon requires a date filter.
      new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const res = await this.clientFor(credentials).get<RawOrdersEnvelope>(ORDERS_BASE, {
      MarketplaceIds: marketplaceIds,
      CreatedAfter: createdAfter,
      MaxResultsPerPage: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params['cursor'] ? { NextToken: params['cursor'] } : {}),
    })
    const orders = res.payload?.Orders ?? []
    return orders.map((o) => transformOrder(o))
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = this.clientFor(credentials)
    const [orderRes, itemsRes] = await Promise.all([
      client.get<RawOrderEnvelope>(`${ORDERS_BASE}/${encodeURIComponent(id)}`),
      client.get<RawOrderItemsEnvelope>(
        `${ORDERS_BASE}/${encodeURIComponent(id)}/orderItems`,
      ),
    ])
    const raw = orderRes.payload
    if (!raw) {
      throw new Error(`Amazon getOrder: empty payload for order '${id}'`)
    }
    // Merge OrderItems into the raw order so the transform can emit
    // canonical line items.
    raw.OrderItems = itemsRes.payload?.OrderItems ?? []
    return transformOrder(raw)
  }

  // ── Fulfillments (projected from OrderItems) ──────────────────────────────

  async listFulfillments(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Fulfillment[]> {
    const orderId = (params['orderId'] ?? params['order_id']) as string | undefined
    if (!orderId) {
      throw new Error('Amazon listFulfillments requires `orderId` in query params.')
    }
    const res = await this.clientFor(credentials).get<RawOrderItemsEnvelope>(
      `${ORDERS_BASE}/${encodeURIComponent(orderId)}/orderItems`,
    )
    return transformFulfillments(orderId, res.payload?.OrderItems)
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    // Fulfillment id format from this adapter is `${orderId}:${orderItemId}`.
    const [orderId, itemId] = id.split(':')
    if (!orderId || !itemId) {
      throw new Error('Amazon fulfillment id must be formatted as `orderId:orderItemId`')
    }
    const res = await this.clientFor(credentials).get<RawOrderItemsEnvelope>(
      `${ORDERS_BASE}/${encodeURIComponent(orderId)}/orderItems`,
    )
    const item = res.payload?.OrderItems?.find((i) => i.OrderItemId === itemId)
    if (!item) {
      throw new Error(`Amazon getFulfillment: no order item '${itemId}' on order '${orderId}'`)
    }
    return transformFulfillment(orderId, item)
  }

  // ── Refunds (Finances RefundEventList) ────────────────────────────────────

  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const orderId = (params['orderId'] ?? params['order_id']) as string | undefined
    const qp: Record<string, unknown> = {
      MaxResultsPerPage: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    if (!orderId) {
      qp['PostedAfter'] =
        params.updatedAfter?.toISOString() ??
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    }
    const path = orderId
      ? `${FINANCES_ORDER_EVENTS_BASE}/${encodeURIComponent(orderId)}/financialEvents`
      : FINANCES_BASE
    const res = await this.clientFor(credentials).get<RawFinancialEventsEnvelope>(path, qp)
    const events = res.payload?.FinancialEvents?.RefundEventList ?? []
    return events.map((e) => transformRefund(e as unknown as RawAmazonRefundEvent))
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    // Refund ids are `${amazonOrderId}:${postedDate}` — we can't directly
    // look up a single refund, so fetch the per-order refund list and
    // find the matching composite.
    const [orderId] = id.split(':')
    if (!orderId) {
      throw new Error('Amazon refund id must be formatted as `orderId:postedDate`')
    }
    const refunds = await this.listRefunds(credentials, { orderId } as QueryParams)
    const found = refunds.find((r) => r.id === id)
    if (!found) {
      throw new Error(`Amazon getRefund: no refund event matching id '${id}'`)
    }
    return found
  }

  // ── Transactions (Finances FinancialEvents) ───────────────────────────────

  async listTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Transaction[]> {
    const orderId = (params['orderId'] ?? params['order_id']) as string | undefined
    const qp: Record<string, unknown> = {
      MaxResultsPerPage: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    if (!orderId) {
      qp['PostedAfter'] =
        params.updatedAfter?.toISOString() ??
        new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    }
    const path = orderId
      ? `${FINANCES_ORDER_EVENTS_BASE}/${encodeURIComponent(orderId)}/financialEvents`
      : FINANCES_BASE
    const res = await this.clientFor(credentials).get<RawFinancialEventsEnvelope>(path, qp)
    const fe = res.payload?.FinancialEvents
    if (!fe) return []
    const events: RawAmazonFinancialEvent[] = [
      ...tag(fe.ShipmentEventList, 'ShipmentEvent'),
      ...tag(fe.RefundEventList, 'RefundEvent'),
      ...tag(fe.AdjustmentEventList, 'AdjustmentEvent'),
      ...tag(fe.SellerReviewEnrollmentPaymentEventList, 'SellerReviewEnrollmentPaymentEvent'),
      ...tag(fe.GuaranteeClaimEventList, 'GuaranteeClaimEvent'),
      ...tag(fe.ChargebackEventList, 'ChargebackEvent'),
      ...tag(fe.ServiceFeeEventList, 'ServiceFeeEvent'),
    ]
    return events.map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    // Canonical transaction id is `${orderId}:${eventType}:${postedDate}`.
    const [orderId] = id.split(':')
    if (!orderId) {
      throw new Error(
        'Amazon transaction id must be formatted as `orderId:eventType:postedDate`',
      )
    }
    const txs = await this.listTransactions(credentials, { orderId } as QueryParams)
    const found = txs.find((t) => t.id === id)
    if (!found) {
      throw new Error(`Amazon getTransaction: no financial event matching id '${id}'`)
    }
    return found
  }
}

/**
 * Tag an array of raw events with their event type. Used by
 * {@link AmazonSPAdapter.listTransactions} to flatten Amazon's per-type
 * event lists into a single homogeneous array that
 * {@link transformTransaction} can consume.
 */
function tag(
  list: Array<Record<string, unknown>> | undefined,
  eventType: AmazonFinancialEventType,
): RawAmazonFinancialEvent[] {
  if (!list) return []
  return list.map((e) => ({ ...(e as RawAmazonFinancialEvent), eventType }))
}
