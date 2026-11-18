/**
 * Allegro adapter for the ecommerce vertical.
 *
 * Maps Allegro's REST APIs to the canonical ecommerce resources. Allegro
 * is Poland's dominant marketplace (seller-scoped, OAuth2 refresh).
 *
 * Slug: `allegro`
 * Platform identifier: `allegro`
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (24):
 *
 *   Products:     list, get, create, update, delete   (Sale Offers API)
 *   Collections:  list, get                           (Categories API — read-only)
 *   Inventory:    list, get, set                      (Stock on offers)
 *   Orders:       list, get                           (Checkout Forms API)
 *   Fulfillments: list, get, create                   (Shipments API)
 *   Refunds:      list, get (Payments Refunds API); create (unverified
 *                 POST /sale/disputes, absent from the spec, left as-is)
 *   Transactions: list, get                           (Payment Operations)
 *   Locations:    list, get                           (Points of Service API, seller.id from /me)
 *   Discounts:    list, get                           (Loyalty Promotions API, per promotionType)
 *
 * Omitted (18) — the registry will return HTTP 501 automatically:
 *
 *   Variants (5)     — Allegro has offer variants as parameters, not resources.
 *   Customers (5)    — Allegro does not expose a customer/buyer resource;
 *                      buyer data is embedded in checkout-form orders only.
 *   createCollection, updateCollection, deleteCollection — categories are read-only.
 *   createDiscount, updateDiscount, deleteDiscount — loyalty promotions are
 *                      structured differently; this adapter does not implement
 *                      write operations for them.
 *   adjustInventoryLevel — Allegro uses absolute stock updates only.
 *   createOrder, updateOrder, cancelOrder — buyers create orders.
 *   updateFulfillment, cancelFulfillment — Allegro doesn't support these.
 *   createTransaction — Allegro controls transactions.
 *
 * ── Resource coverage ──────────────────────────────────────────────────
 * Unavailable: customer — Allegro does not expose a buyer/customer resource endpoint; buyer data is embedded in orders only.
 *
 * Webhooks: not implemented — Allegro does not have a standard webhook
 * system; it uses a polling-based notification approach.
 */

import type { Credentials, QueryParams } from '@opensteward/shared'
import {
  connectionScope,
  cursorPagerKey,
  pageByRows,
  pageLocally,
  pageOffset,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { EcommerceAdapter } from '../../adapter/interface'
import type { Product } from '../../schema/product'
import type { Collection } from '../../schema/collection'
import type { Location } from '../../schema/location'
import type { InventoryLevel } from '../../schema/inventory'
import type { Order } from '../../schema/order'
import type { Fulfillment } from '../../schema/fulfillment'
import type { Refund } from '../../schema/refund'
import type { Transaction } from '../../schema/transaction'
import type { Discount } from '../../schema/discount'

import {
  buildAuthUrl,
  exchangeCode as allegroExchangeCode,
  refreshCredentials as allegroRefreshCredentials,
} from './auth'
import { AllegroClient } from './client'
import {
  DEFAULT_ENVIRONMENT,
  DEFAULT_PAGE_SIZE,
  OFFERS_BASE,
  OFFERS_MAX_LIMIT,
  ORDERS_MAX_LIMIT,
  PAYMENT_OPERATIONS_MAX_LIMIT,
  PAYMENT_OPERATIONS_MAX_OFFSET,
  ORDERS_BASE,
  DISPUTES_BASE,
  REFUNDS_BASE,
  REFUNDS_MAX_LIMIT,
  ME_PATH,
  PROMOTIONS_PAGE_SIZE,
  PROMOTIONS_MAX_WINDOW,
  PROMOTION_TYPES,
  CATEGORIES_BASE,
  PAYMENTS_BASE,
  POINTS_OF_SERVICE_BASE,
  LOYALTY_PROMOTIONS_BASE,
} from './constants'
import { transformProduct, untransformProduct, type RawAllegroOffer } from './transform/product'
import { transformCategory, type RawAllegroCategory } from './transform/category'
import { transformInventoryLevel } from './transform/inventory'
import { transformOrder, type RawAllegroCheckoutForm } from './transform/order'
import {
  transformFulfillment,
  transformFulfillments,
  untransformFulfillment,
  type RawAllegroShipment,
} from './transform/fulfillment'
import { transformRefund, untransformRefund, type RawAllegroDispute } from './transform/refund'
import { transformRefundDetails, type RawAllegroRefundDetails } from './transform/payment-refund'
import { transformTransaction, type RawAllegroPaymentOperation } from './transform/transaction'
import { transformLocation, type RawAllegroPointOfService } from './transform/location'
import { transformDiscount, type RawAllegroPromotion } from './transform/discount'

// ── Response envelopes ────────────────────────────────────────────────────────

interface RawOffersEnvelope {
  offers?: RawAllegroOffer[]
  totalCount?: number
  count?: number
}

interface RawCategoriesEnvelope {
  categories?: RawAllegroCategory[]
}

interface RawOrdersEnvelope {
  checkoutForms?: RawAllegroCheckoutForm[]
  count?: number
  totalCount?: number
}

interface RawShipmentsEnvelope {
  shipments?: RawAllegroShipment[]
}

interface RawRefundsEnvelope {
  refunds?: RawAllegroRefundDetails[]
  count?: number
  totalCount?: number
}

interface RawMeResponse {
  id?: string
}

interface RawPaymentOperationsEnvelope {
  paymentOperations?: RawAllegroPaymentOperation[]
  count?: number
  totalCount?: number
}

interface RawPointsOfServiceEnvelope {
  posList?: RawAllegroPointOfService[]
}

interface RawLoyaltyPromotionsEnvelope {
  promotions?: RawAllegroPromotion[]
  totalCount: number
}

/** A position in the promotion walk: index into PROMOTION_TYPES, then offset. */
function promotionCursor(typeIndex: number, offset: number): string {
  return `${typeIndex}:${offset}`
}

/**
 * The page size to send an offset endpoint: the caller's limit, clamped to the
 * endpoint's documented `limit` maximum. Offsets stride by this size.
 */
function offsetPageSize(params: QueryParams, max: number): number {
  const asked = params.limit
  const limit =
    typeof asked === 'number' && Number.isFinite(asked) && asked >= 1
      ? Math.floor(asked)
      : DEFAULT_PAGE_SIZE
  return Math.min(limit, max)
}

/**
 * Report one offset page. `totalCount` makes `hasMore` exact; without it a
 * short page ends the collection and a full page stays unknown. A size clamped
 * below the caller's limit is reported so shortness is judged against it.
 */
function reportOffsetPage(
  params: QueryParams,
  size: number,
  offset: number,
  returned: number,
  totalCount: number | undefined,
  maxOffset = Infinity,
): void {
  const clamped = typeof params.limit === 'number' && size < params.limit ? { pageSize: size } : {}
  // The platform rejects an offset past its ceiling, so the page whose next
  // offset would cross it is the last one that can be served. totalCount is
  // withheld there: the router ranks it above hasMore and would ask again.
  if (offset + size > maxOffset) {
    reportUpstreamPage(params, { hasMore: false, ...clamped })
  } else if (typeof totalCount === 'number') {
    reportUpstreamPage(params, { totalCount, hasMore: offset + returned < totalCount, ...clamped })
  } else if (returned < size) {
    reportUpstreamPage(params, { hasMore: false, ...clamped })
  } else {
    reportUpstreamPage(params, clamped)
  }
}

export interface AllegroAdapterConfig {
  /** Allegro app client id. Optional — may come from credentials. */
  clientId?: string
  /** Allegro app client secret. Optional — may come from credentials. */
  clientSecret?: string
  /** Default environment: 'production' | 'sandbox'. */
  environment?: 'production' | 'sandbox'
  /** Default OAuth2 redirect URI. */
  redirectUri?: string
}

export class AllegroAdapter implements EcommerceAdapter {
  readonly platform = 'allegro'
  readonly version = '0.1.0'
  /** Honours `params.search`; see AdapterCapabilities. Declared so the
   *  router can refuse the parameter on adapters that would drop it. */
  readonly capabilities = { search: true }

  private configClientId: string | undefined
  private configClientSecret: string | undefined
  private configEnvironment: string
  private configRedirectUri: string | undefined

  constructor(config: AllegroAdapterConfig = {}) {
    this.configClientId = config.clientId
    this.configClientSecret = config.clientSecret
    this.configEnvironment = config.environment ?? DEFAULT_ENVIRONMENT
    this.configRedirectUri = config.redirectUri
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    const clientId = this.configClientId
    if (!clientId) {
      throw new Error(
        'Allegro adapter getAuthUrl requires clientId — configure it in ' +
          'apps/integration-server/config/config.yml under adapters.allegro.',
      )
    }
    const redirectUri = this.configRedirectUri ?? ''
    return buildAuthUrl(clientId, redirectUri, state, this.configEnvironment)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    const clientId = this.configClientId
    const clientSecret = this.configClientSecret
    if (!clientId || !clientSecret) {
      throw new Error(
        'Allegro adapter exchangeCode requires clientId and clientSecret — configure them in ' +
          'apps/integration-server/config/config.yml under adapters.allegro.',
      )
    }
    return allegroExchangeCode(code, redirectUri, clientId, clientSecret, this.configEnvironment)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return allegroRefreshCredentials(credentials)
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  verifyWebhookSignature(
    _payload: Record<string, unknown>,
    _headers: Record<string, string>,
  ): boolean {
    // Allegro does not have a standard webhook system — it uses polling-based
    // notifications instead.
    return false
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private clientFor(credentials: Credentials): AllegroClient {
    return new AllegroClient(credentials)
  }

  // ── Products (Sale Offers API) ────────────────────────────────────────────

  async listProducts(credentials: Credentials, params: QueryParams): Promise<Product[]> {
    const client = this.clientFor(credentials)
    const limit = offsetPageSize(params, OFFERS_MAX_LIMIT)
    const offset = pageOffset(params, limit)
    const qp: Record<string, unknown> = { limit, offset }
    const search = params.search as string | undefined
    if (search) qp['name'] = search
    const res = await client.get<RawOffersEnvelope>(OFFERS_BASE, qp)
    const offers = res.offers ?? []
    reportOffsetPage(params, limit, offset, offers.length, res.totalCount)
    return offers.map(transformProduct)
  }

  async getProduct(credentials: Credentials, id: string): Promise<Product> {
    const res = await this.clientFor(credentials).get<RawAllegroOffer>(
      `${OFFERS_BASE}/${encodeURIComponent(id)}`,
    )
    return transformProduct(res)
  }

  async createProduct(credentials: Credentials, data: Partial<Product>): Promise<Product> {
    const body = untransformProduct(data)
    const res = await this.clientFor(credentials).post<RawAllegroOffer>(OFFERS_BASE, body)
    return transformProduct(res)
  }

  async updateProduct(
    credentials: Credentials,
    id: string,
    data: Partial<Product>,
  ): Promise<Product> {
    const body = untransformProduct(data)
    const res = await this.clientFor(credentials).put<RawAllegroOffer>(
      `${OFFERS_BASE}/${encodeURIComponent(id)}`,
      body,
    )
    return transformProduct(res)
  }

  async deleteProduct(credentials: Credentials, id: string): Promise<void> {
    // Allegro doesn't have a DELETE endpoint for offers — instead we
    // end the offer by changing its publication status.
    await this.clientFor(credentials).put<unknown>(`${OFFERS_BASE}/${encodeURIComponent(id)}`, {
      publication: { status: 'END' },
    })
  }

  // ── Collections (Categories API — read-only) ──────────────────────────────

  async listCollections(credentials: Credentials, params: QueryParams): Promise<Collection[]> {
    const client = this.clientFor(credentials)
    const parentId = (params['parentId'] ?? params['parent_id']) as string | undefined
    const qp: Record<string, unknown> = {}
    if (parentId) qp['parent.id'] = parentId
    // The endpoint takes no paging parameters and returns the parent's whole
    // child list, so each caller page is cut from it here.
    const res = await client.get<RawCategoriesEnvelope>(CATEGORIES_BASE, qp)
    return pageLocally((res.categories ?? []).map(transformCategory), params)
  }

  async getCollection(credentials: Credentials, id: string): Promise<Collection> {
    const res = await this.clientFor(credentials).get<RawAllegroCategory>(
      `${CATEGORIES_BASE}/${encodeURIComponent(id)}`,
    )
    return transformCategory(res)
  }

  // ── Inventory (Stock on Offers) ───────────────────────────────────────────

  async listInventoryLevels(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<InventoryLevel[]> {
    const client = this.clientFor(credentials)
    const limit = offsetPageSize(params, OFFERS_MAX_LIMIT)
    const offset = pageOffset(params, limit)
    const res = await client.get<RawOffersEnvelope>(OFFERS_BASE, { limit, offset })
    // One level per offer, so one upstream page is one caller page.
    const offers = res.offers ?? []
    reportOffsetPage(params, limit, offset, offers.length, res.totalCount)
    return offers.map(transformInventoryLevel)
  }

  async getInventoryLevel(credentials: Credentials, id: string): Promise<InventoryLevel> {
    // Canonical id is `${offerId}:allegro-default`; extract the offer id.
    const offerId = id.includes(':') ? id.split(':')[0]! : id
    const res = await this.clientFor(credentials).get<RawAllegroOffer>(
      `${OFFERS_BASE}/${encodeURIComponent(offerId)}`,
    )
    return transformInventoryLevel(res)
  }

  async setInventoryLevel(
    credentials: Credentials,
    data: { variantId: string; locationId: string; available: number },
  ): Promise<InventoryLevel> {
    const offerId = data.variantId
    const client = this.clientFor(credentials)
    // Update stock on the offer via PATCH-like PUT
    await client.patch<unknown>(`${OFFERS_BASE}/${encodeURIComponent(offerId)}`, {
      stock: { available: data.available },
    })
    return this.getInventoryLevel(credentials, offerId)
  }

  // ── Orders (Checkout Forms API) ───────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = this.clientFor(credentials)
    const limit = offsetPageSize(params, ORDERS_MAX_LIMIT)
    const offset = pageOffset(params, limit)
    const qp: Record<string, unknown> = { limit, offset }
    const status = params['status'] as string | undefined
    if (status) qp['status'] = status
    const res = await client.get<RawOrdersEnvelope>(ORDERS_BASE, qp)
    const forms = res.checkoutForms ?? []
    reportOffsetPage(params, limit, offset, forms.length, res.totalCount)
    return forms.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const res = await this.clientFor(credentials).get<RawAllegroCheckoutForm>(
      `${ORDERS_BASE}/${encodeURIComponent(id)}`,
    )
    return transformOrder(res)
  }

  // ── Fulfillments (Shipments API) ──────────────────────────────────────────

  async listFulfillments(credentials: Credentials, params: QueryParams): Promise<Fulfillment[]> {
    const orderId = (params['orderId'] ?? params['order_id']) as string | undefined
    if (!orderId) {
      throw new Error('Allegro listFulfillments requires `orderId` in query params.')
    }
    const res = await this.clientFor(credentials).get<RawShipmentsEnvelope>(
      `${ORDERS_BASE}/${encodeURIComponent(orderId)}/shipments`,
    )
    return transformFulfillments(orderId, res.shipments)
  }

  async getFulfillment(credentials: Credentials, id: string): Promise<Fulfillment> {
    // Fulfillment id may be composite `${orderId}:${shipmentId}` or plain.
    const parts = id.split(':')
    let orderId: string
    let shipmentId: string
    if (parts.length >= 2) {
      orderId = parts[0]!
      shipmentId = parts[1]!
    } else {
      throw new Error('Allegro getFulfillment requires id formatted as `orderId:shipmentId`')
    }
    // Allegro doesn't have a get-single-shipment endpoint; list and find.
    const res = await this.clientFor(credentials).get<RawShipmentsEnvelope>(
      `${ORDERS_BASE}/${encodeURIComponent(orderId)}/shipments`,
    )
    const shipment = (res.shipments ?? []).find((s) => s.id === shipmentId)
    if (!shipment) {
      throw new Error(`Allegro shipment '${shipmentId}' not found for order '${orderId}'`)
    }
    return transformFulfillment(orderId, shipment)
  }

  async createFulfillment(
    credentials: Credentials,
    data: Partial<Fulfillment>,
  ): Promise<Fulfillment> {
    const orderId = data.orderId
    if (!orderId) {
      throw new Error('Allegro createFulfillment requires `orderId`.')
    }
    const body = untransformFulfillment(data)
    const res = await this.clientFor(credentials).post<RawAllegroShipment>('/order/shipments', body)
    return transformFulfillment(orderId, res)
  }

  // ── Refunds (Payments Refunds API) ────────────────────────────────────────

  // GET /payments/refunds (getRefundedPayments): offset + limit (1..100),
  // `order.id` filter, envelope { refunds, count, totalCount }.
  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const client = this.clientFor(credentials)
    const limit = offsetPageSize(params, REFUNDS_MAX_LIMIT)
    const offset = pageOffset(params, limit)
    const qp: Record<string, unknown> = { limit, offset }
    const orderId = (params['orderId'] ?? params['order_id']) as string | undefined
    if (orderId) qp['order.id'] = orderId
    const res = await client.get<RawRefundsEnvelope>(REFUNDS_BASE, qp)
    const refunds = res.refunds ?? []
    reportOffsetPage(params, limit, offset, refunds.length, res.totalCount)
    return refunds.map(transformRefundDetails)
  }

  // The spec has no GET /payments/refunds/{id}; the list's documented `id`
  // filter ("ID of the refund.") reads one back.
  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const res = await this.clientFor(credentials).get<RawRefundsEnvelope>(REFUNDS_BASE, { id })
    const refund = res.refunds?.[0]
    if (!refund) {
      throw Object.assign(new Error(`Allegro refund '${id}' not found`), {
        statusCode: 404,
        code: 'NOT_FOUND',
      })
    }
    return transformRefundDetails(refund)
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const body = untransformRefund(data)
    const res = await this.clientFor(credentials).post<RawAllegroDispute>(DISPUTES_BASE, body)
    return transformRefund(res)
  }

  // ── Transactions (Payment Operations) ─────────────────────────────────────

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = this.clientFor(credentials)
    const limit = offsetPageSize(params, PAYMENT_OPERATIONS_MAX_LIMIT)
    const offset = pageOffset(params, limit)
    if (offset > PAYMENT_OPERATIONS_MAX_OFFSET) {
      // Past the documented ceiling the platform answers 400; nothing is reachable.
      reportUpstreamPage(params, { hasMore: false })
      return []
    }
    const qp: Record<string, unknown> = { limit, offset }
    const res = await client.get<RawPaymentOperationsEnvelope>(PAYMENTS_BASE, qp)
    const ops = res.paymentOperations ?? []
    reportOffsetPage(
      params,
      limit,
      offset,
      ops.length,
      res.totalCount,
      PAYMENT_OPERATIONS_MAX_OFFSET,
    )
    return ops.map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    // Allegro doesn't have a direct get-by-id for payment operations.
    // Filter the list.
    const client = this.clientFor(credentials)
    const res = await client.get<RawPaymentOperationsEnvelope>(PAYMENTS_BASE, {
      'payment.id': id,
      limit: 1,
    })
    const op = res.paymentOperations?.[0]
    if (!op) {
      throw new Error(`Allegro getTransaction: no payment operation found for id '${id}'`)
    }
    return transformTransaction(op)
  }

  // ── Locations (Points of Service API) ─────────────────────────────────────

  // GET /points-of-service (getPOSListUsingGET) requires `seller.id` ("User
  // identifier."), which GET /me returns as `id` ("User Id."). It takes no
  // paging parameters and returns every point in `posList`.
  async listLocations(credentials: Credentials, params: QueryParams): Promise<Location[]> {
    const client = this.clientFor(credentials)
    const me = await client.get<RawMeResponse>(ME_PATH)
    if (!me.id)
      throw new Error('Allegro GET /me returned no user id; cannot list points of service')
    const res = await client.get<RawPointsOfServiceEnvelope>(POINTS_OF_SERVICE_BASE, {
      'seller.id': me.id,
    })
    return pageLocally((res.posList ?? []).map(transformLocation), params)
  }

  async getLocation(credentials: Credentials, id: string): Promise<Location> {
    const res = await this.clientFor(credentials).get<RawAllegroPointOfService>(
      `${POINTS_OF_SERVICE_BASE}/${encodeURIComponent(id)}`,
    )
    return transformLocation(res)
  }

  // ── Discounts (Loyalty Promotions API) ────────────────────────────────────

  // GET /sale/loyalty/promotions: "Filtering by promotion type is required."
  // One promotionType per request, so the list is the four documented types
  // walked in turn, each paged by offset until its totalCount, and the
  // caller's page cut from that stream.
  async listDiscounts(credentials: Credentials, params: QueryParams): Promise<Discount[]> {
    const client = this.clientFor(credentials)
    const environment =
      (credentials.extra?.['environment'] as string | undefined) ?? DEFAULT_ENVIRONMENT
    const key = cursorPagerKey(
      connectionScope(`allegro:${environment}`, credentials),
      'discounts',
      { size: PROMOTIONS_PAGE_SIZE },
    )
    const { items } = await pageByRows<Discount>(
      key,
      params,
      async (cursor) => {
        const [t, o] = (cursor ?? promotionCursor(0, 0)).split(':')
        const typeIndex = Number(t)
        const offset = Number(o)
        const res = await client.get<RawLoyaltyPromotionsEnvelope>(LOYALTY_PROMOTIONS_BASE, {
          promotionType: PROMOTION_TYPES[typeIndex],
          limit: PROMOTIONS_PAGE_SIZE,
          offset,
        })
        const rows = res.promotions ?? []
        const reached = offset + rows.length
        // `totalCount` is required on SellerRebatesDto.
        const more = reached < res.totalCount
        let next: string | undefined
        if (more && rows.length > 0) {
          if (reached + PROMOTIONS_PAGE_SIZE > PROMOTIONS_MAX_WINDOW) {
            throw new Error(
              `Allegro lists at most ${PROMOTIONS_MAX_WINDOW} promotions per type ("Sum of limit and offset must be equal to or lower than 50000"); ${PROMOTION_TYPES[typeIndex]} has more`,
            )
          }
          next = promotionCursor(typeIndex, reached)
        } else if (typeIndex + 1 < PROMOTION_TYPES.length) {
          next = promotionCursor(typeIndex + 1, 0)
        }
        return { items: rows.map(transformDiscount), next }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  async getDiscount(credentials: Credentials, id: string): Promise<Discount> {
    const res = await this.clientFor(credentials).get<RawAllegroPromotion>(
      `${LOYALTY_PROMOTIONS_BASE}/${encodeURIComponent(id)}`,
    )
    return transformDiscount(res)
  }
}
