/**
 * Kaufland Marketplace adapter for the ecommerce vertical.
 *
 * Maps the Kaufland Marketplace Seller API (v2) to the canonical ecommerce
 * resources. Kaufland uses HMAC-SHA256 per-request signing — there is no
 * OAuth code exchange. Credentials are a Client Key + Secret Key pair issued
 * from the Kaufland Seller Portal.
 *
 * Supported resources:
 *   Products (read-only from catalog; write via product-data)
 *   Collections (Kaufland categories — read-only)
 *   Inventory (units / warehouses)
 *   Orders (+ order-units as line items)
 *   Fulfillments (via order-unit send/cancel)
 *   Refunds (via order-unit refund)
 *   Discounts (Kaufland vouchers)
 *
 * NOT supported (no Kaufland API):
 *   Customers (no seller-facing customer list)
 *   Transactions (payment managed by Kaufland)
 *   Variants (Kaufland products map 1:1 to units — no variant tree)
 *
 * Docs: https://sellerapi.kaufland.com/
 */

import { customForm, pageOffset, reportUpstreamPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Location } from '../../schema/location'
import type { InventoryLevel } from '../../schema/inventory'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Refund } from '../../schema/refund'
import type { Discount } from '../../schema/discount'
import type { WebhookEvent } from '../../schema/webhook'

import { buildAuthUrl, exchangeCode as kauflandExchangeCode } from './auth'
import { KauflandMarketplaceClient, type ListResult } from './client'
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_STOREFRONT,
  MAX_PAGE_SIZE,
  MAX_WAREHOUSE_PAGE_SIZE,
} from './constants'
import { verifyKauflandWebhook, parseKauflandWebhookEvents } from './webhook'

import { transformProduct, untransformProduct, type RawKauflandProduct } from './transform/product'
import { transformCollection, type RawKauflandCategory } from './transform/collection'
import {
  transformLocation,
  syntheticDefaultLocation,
  type RawKauflandWarehouse,
} from './transform/location'
import {
  transformInventoryLevel,
  untransformInventoryLevel,
  type RawKauflandUnit,
} from './transform/inventory'
import {
  transformOrder,
  type RawKauflandOrder,
} from './transform/order'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawKauflandOrderUnitForFulfillment,
} from './transform/fulfillment'
import {
  transformRefund,
  untransformRefund,
  type RawKauflandRefund,
} from './transform/refund'
import {
  transformDiscount,
  untransformDiscount,
  type RawKauflandVoucher,
} from './transform/discount'

// ── Credential form ───────────────────────────────────────────────────────────

const CREDENTIAL_FORM = customForm({
  fields: [
    {
      name: 'clientKey',
      label: 'Client Key',
      type: 'text',
      required: true,
      placeholder: '32-character Client Key',
      helpText:
        'Found in the Kaufland Seller Portal at Settings → API. The Client Key is the 32-character public identifier.',
    },
    {
      name: 'secretKey',
      label: 'Secret Key',
      type: 'password',
      required: true,
      placeholder: '64-character Secret Key',
      helpText:
        'Found in the Kaufland Seller Portal at Settings → API. The Secret Key is the 64-character private signing key.',
    },
  ],
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const clientKey = (fields['clientKey'] ?? '').trim()
    const secretKey = (fields['secretKey'] ?? '').trim()
    if (!clientKey) throw new Error('Client Key is required.')
    if (!secretKey) throw new Error('Secret Key is required.')
    return {
      accessToken: clientKey,
      extra: { secretKey },
    }
  },
})

// ── Offset paging ─────────────────────────────────────────────────────────────

/**
 * The page size to send an offset endpoint: the caller's limit, clamped to the
 * endpoint's documented `limit` maximum. Offsets stride by this size, which
 * also keeps /vouchers' "`offset` must be a multiple of `limit`" true.
 */
function offsetPageSize(params: QueryParams, max: number): number {
  const asked = params.limit
  const limit =
    typeof asked === 'number' && Number.isFinite(asked) && asked >= 1
      ? Math.floor(asked)
      : DEFAULT_PAGE_SIZE
  return Math.min(limit, max)
}

/** `limit` and `offset` for the caller's 1-based page, clamped to `max`. */
function offsetPage(params: QueryParams, max: number): { limit: number; offset: number } {
  const limit = offsetPageSize(params, max)
  return { limit, offset: pageOffset(params, limit) }
}

/** `{ pageSize }` when the size sent was clamped below the caller's limit. */
function clampedSize(
  params: QueryParams,
  sent: { limit: number },
): { pageSize?: number } {
  return typeof params.limit === 'number' && sent.limit < params.limit
    ? { pageSize: sent.limit }
    : {}
}

/**
 * Report one offset page. Kaufland's `pagination.total` makes `hasMore` exact;
 * `pagination` is optional in the spec, so without it a short page ends the
 * collection and a full page stays unknown. A size clamped below the caller's
 * limit is reported so shortness is judged against it.
 */
function reportOffsetPage(
  params: QueryParams,
  sent: { limit: number; offset: number },
  res: ListResult<unknown>,
): void {
  const clamped = clampedSize(params, sent)
  const returned = res.items.length
  if (typeof res.total === 'number') {
    reportUpstreamPage(params, {
      totalCount: res.total,
      hasMore: sent.offset + returned < res.total,
      ...clamped,
    })
  } else if (returned < sent.limit) {
    reportUpstreamPage(params, { hasMore: false, ...clamped })
  } else {
    reportUpstreamPage(params, clamped)
  }
}

// ── Adapter config ────────────────────────────────────────────────────────────

export interface KauflandMarketplaceAdapterConfig {
  /**
   * Kaufland storefront country code (default: 'de').
   * Supported: 'de', 'at', 'cz', 'sk', 'pl'.
   */
  storefront?: string
  /**
   * Set to true to use the Kaufland Playground (sandbox) environment.
   */
  sandbox?: boolean
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class KauflandMarketplaceAdapter implements EcommerceAdapter {
  readonly platform = 'kaufland-marketplace'
  readonly version = '0.1.0'

  // Connect Link credential form.
  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  private storefront: string
  private sandbox: boolean

  constructor(config: KauflandMarketplaceAdapterConfig = {}) {
    this.storefront = config.storefront ?? DEFAULT_STOREFRONT
    this.sandbox = config.sandbox ?? false
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  /**
   * Returns the Kaufland Seller Portal API settings URL — there is no OAuth
   * authorize URL for Kaufland. The `state` param is intentionally ignored.
   */
  getAuthUrl(_state: string): string {
    return buildAuthUrl()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return kauflandExchangeCode()
  }

  /**
   * Kaufland API keys do not expire. Returning credentials unchanged is correct.
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
    return verifyKauflandWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseKauflandWebhookEvents(payload)
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): KauflandMarketplaceClient {
    return new KauflandMarketplaceClient(credentials, this.sandbox)
  }

  /**
   * Query for an offset list: the caller's page as `limit`/`offset` (GET
   * parameters on every Kaufland collection), plus storefront and filters.
   */
  private listParams(
    params: QueryParams,
    sent: { limit: number; offset: number },
  ): Record<string, unknown> {
    const out: Record<string, unknown> = {
      limit: sent.limit,
      offset: sent.offset,
      storefront: (params['storefront'] as string | undefined) ?? this.storefront,
    }
    if (params.updatedAfter) {
      out['ts_updated_from_iso'] = params.updatedAfter.toISOString()
    }
    return out
  }

  // ── Products ──────────────────────────────────────────────────────────────

  /**
   * List products from the Kaufland catalog. The /units endpoint is used
   * to enumerate the seller's active listings and map each to a product.
   */
  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const sent = offsetPage(params, MAX_PAGE_SIZE)
    const res = await this.client(credentials).listWithOffset<RawKauflandUnit>(
      'units',
      this.listParams(params, sent),
    )
    reportOffsetPage(params, sent, res)
    // Units have an embedded `product` field — map that to canonical Product.
    return res.items.map((u) => {
      const prod = (u.product as RawKauflandProduct | undefined) ?? {
        id_product: u.id_product ?? undefined,
      }
      return transformProduct(prod)
    })
  }

  /**
   * Get a single product from the Kaufland catalog by EAN or product id.
   * Kaufland's product-data endpoint is keyed by EAN.
   */
  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.client(credentials).get<{ data: RawKauflandProduct }>(
      `product-data/${encodeURIComponent(id)}`,
    )
    return transformProduct(res.data)
  }

  /**
   * Create/replace product data in the Kaufland catalog (PUT /product-data).
   * The `id` field on the canonical Product is used as the EAN.
   */
  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const body = untransformProduct(data, id)
    await this.client(credentials).put<unknown>('product-data', body)
    // PUT returns no product body; re-fetch the updated product.
    return this.getProduct(credentials, id)
  }

  // ── Collections (categories — read-only) ──────────────────────────────────

  async listCollections(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Collection[]> {
    const storefront = (params['storefront'] as string | undefined) ?? this.storefront
    const sent = offsetPage(params, MAX_PAGE_SIZE)
    const res = await this.client(credentials).listWithOffset<RawKauflandCategory>(
      'categories',
      { limit: sent.limit, offset: sent.offset, storefront },
    )
    reportOffsetPage(params, sent, res)
    return res.items.map(transformCollection)
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    // Kaufland does not expose a single-category GET; fetch the tree and find.
    const res = await this.client(credentials).get<{ data: RawKauflandCategory[] }>(
      'categories',
      { storefront: this.storefront },
    )
    const all = res.data ?? []
    const found = all.find((c) => String(c.id_category) === id)
    if (!found) throw new Error(`Category ${id} not found`)
    return transformCollection(found)
  }

  // ── Locations (warehouses) ────────────────────────────────────────────────

  /**
   * GET /warehouses pages by `limit` (maximum 30) and `offset`. The synthetic
   * default location stands in for the whole collection, so it is served only
   * on page 1 — never on an empty page past the end.
   */
  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const sent = offsetPage(params, MAX_WAREHOUSE_PAGE_SIZE)
    let res: ListResult<RawKauflandWarehouse>
    try {
      res = await this.client(credentials).listWithOffset<RawKauflandWarehouse>(
        'warehouses',
        sent,
      )
    } catch (err) {
      // If the warehouse endpoint is not available, return a synthetic default
      // on page 1. A later page failing is a real failure, not an empty list.
      if (sent.offset > 0) throw err
      reportUpstreamPage(params, { hasMore: false, ...clampedSize(params, sent) })
      return [syntheticDefaultLocation(this.storefront)]
    }
    if (res.items.length === 0 && sent.offset === 0) {
      reportUpstreamPage(params, { hasMore: false, ...clampedSize(params, sent) })
      return [syntheticDefaultLocation(this.storefront)]
    }
    reportOffsetPage(params, sent, res)
    return res.items.map(transformLocation)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    if (id === 'default') return syntheticDefaultLocation(this.storefront)
    try {
      const res = await this.client(credentials).get<{ data: RawKauflandWarehouse }>(
        `warehouses/${id}`,
      )
      return transformLocation(res.data)
    } catch {
      return syntheticDefaultLocation(this.storefront)
    }
  }

  // ── Inventory (units) ─────────────────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const sent = offsetPage(params, MAX_PAGE_SIZE)
    const res = await this.client(credentials).listWithOffset<RawKauflandUnit>(
      'units',
      this.listParams(params, sent),
    )
    reportOffsetPage(params, sent, res)
    return res.items.map(transformInventoryLevel)
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    // variantId maps to id_unit in Kaufland. PATCH /units/{id} to update stock.
    const body = untransformInventoryLevel({
      available: data.available,
      storefront: this.storefront,
    })
    const res = await this.client(credentials).patch<{ data: RawKauflandUnit }>(
      `units/${data.variantId}`,
      body,
    )
    return transformInventoryLevel(res.data)
  }

  // ── Orders ────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const sent = offsetPage(params, MAX_PAGE_SIZE)
    const listParams = this.listParams(params, sent)
    if (params.updatedAfter) {
      listParams['ts_units_updated_from_iso'] = params.updatedAfter.toISOString()
      delete listParams['ts_updated_from_iso']
    }
    const res = await this.client(credentials).listWithOffset<RawKauflandOrder>(
      'orders',
      listParams,
    )
    reportOffsetPage(params, sent, res)
    return res.items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const res = await this.client(credentials).get<{ data: RawKauflandOrder }>(
      `orders/${id}`,
      { embedded: 'order_units' },
    )
    return transformOrder(res.data)
  }

  /**
   * Kaufland does not support creating orders via the Seller API — orders
   * originate from buyer purchases on the marketplace.
   */

  /**
   * Cancel all order-units in an order. Kaufland's cancel endpoint operates
   * at the order-unit level; we iterate and cancel each unit.
   */
  async cancelOrder(
    credentials: Credentials,
    id: string,
    data?: { reason?: string },
  ): Promise<Order> {
    // Fetch the order to get unit ids.
    const order = await this.getOrder(credentials, id)
    const client = this.client(credentials)
    const reason = data?.reason ?? 'other'
    await Promise.all(
      (order.lineItems ?? []).map((li) =>
        client.patch(`order-units/${li.id}/cancel`, { reason }),
      ),
    )
    return this.getOrder(credentials, id)
  }

  // ── Fulfillments (order-unit send / cancel) ───────────────────────────────

  async listFulfillments(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Fulfillment[]> {
    const sent = offsetPage(params, MAX_PAGE_SIZE)
    const listParams = this.listParams(params, sent)
    // Kaufland: filter by status to find sent/fulfilled units.
    listParams['status'] = 'sent'
    const orderId = params['orderId'] ?? params['order_id']
    if (orderId) listParams['id_order'] = orderId
    const res = await this.client(credentials).listWithOffset<RawKauflandOrderUnitForFulfillment>(
      'order-units',
      listParams,
    )
    reportOffsetPage(params, sent, res)
    return res.items.map(transformFulfillment)
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    const res = await this.client(credentials).get<{ data: RawKauflandOrderUnitForFulfillment }>(
      `order-units/${id}`,
    )
    return transformFulfillment(res.data)
  }

  /**
   * Mark an order-unit as sent (fulfilled). Kaufland requires both
   * tracking_numbers and carrier_code. The fulfillment id is the
   * Kaufland order-unit id.
   */
  async createFulfillment(
    credentials: Credentials,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    if (!data.id && !(data.lineItems?.[0]?.lineItemId)) {
      throw new Error(
        'createFulfillment requires id (order-unit id) or lineItems[0].lineItemId',
      )
    }
    const unitId = data.id ?? data.lineItems![0]!.lineItemId
    const body = untransformFulfillment(data)
    await this.client(credentials).patch(`order-units/${unitId}/send`, body)
    return this.getFulfillment(credentials, unitId)
  }

  async cancelFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    await this.client(credentials).patch(`order-units/${id}/cancel`, { reason: 'other' })
    return this.getFulfillment(credentials, id)
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  /**
   * List refunds for an order. Kaufland does not expose a refunds list
   * endpoint per se; we list returned/refunded order-units scoped to the
   * order. The `order_id` query param is required.
   */
  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const orderId = params['orderId'] ?? params['order_id']
    if (!orderId) {
      throw new Error('listRefunds requires `orderId` in query params')
    }
    const res = await this.client(credentials).listWithOffset<RawKauflandRefund>(
      'returns',
      {
        storefront: this.storefront,
        limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 100),
        offset: (params['offset'] as number | undefined) ?? 0,
      },
    )
    return res.items
      .filter((r) => !orderId || String(r.id_order) === String(orderId))
      .map(transformRefund)
  }

  /**
   * Issue a refund for a specific order-unit via PATCH /order-units/{id}/refund.
   * The `amount` (eurocents) and `reason` are required.
   */
  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const unitId = data.refundLineItems?.[0]?.lineItemId ?? data.orderId
    if (!unitId) {
      throw new Error(
        'createRefund requires refundLineItems[0].lineItemId (order-unit id)',
      )
    }
    const body = untransformRefund(data)
    await this.client(credentials).patch(`order-units/${unitId}/refund`, body)
    // Return a synthetic refund object since the API returns no body.
    return transformRefund({
      id_order_unit: unitId,
      id_order: data.orderId,
      amount: data.amount?.amount ?? 0,
      currency: data.amount?.currency ?? 'EUR',
      reason: data.reason,
    })
  }

  // ── Discounts (vouchers) ──────────────────────────────────────────────────

  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    // `offset` must be a multiple of `limit`: it strides by the size sent.
    const sent = offsetPage(params, MAX_PAGE_SIZE)
    const res = await this.client(credentials).listWithOffset<RawKauflandVoucher>(
      'vouchers',
      { storefront: this.storefront, limit: sent.limit, offset: sent.offset },
    )
    reportOffsetPage(params, sent, res)
    return res.items.map(transformDiscount)
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const res = await this.client(credentials).get<{ data: RawKauflandVoucher }>(
      `vouchers/${id}`,
    )
    return transformDiscount(res.data)
  }

  async createDiscount(
    credentials: Credentials,
    data: Partial<Discount>,
  ): Promise<Discount> {
    const body = untransformDiscount(data)
    const res = await this.client(credentials).post<{ data: RawKauflandVoucher }>(
      'vouchers',
      body,
    )
    return transformDiscount(res.data)
  }
}
