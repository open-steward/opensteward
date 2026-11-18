import { pageOffset, reportUpstreamPage, simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  RateRequestParams,
  QueryParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Rate } from '../../schema/rate'
import type { Order } from '../../schema/order'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { BorzoClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformShipment, type BorzoOrder, type BorzoOrderResponse } from './transform/shipment'
import { transformTracking } from './transform/tracking'
import { transformRate, type BorzoCalculateResponse } from './transform/rate'

interface BorzoOrdersResponse {
  is_successful: boolean
  orders?: BorzoOrder[] | null
  /** "Total number of found orders for pagination." */
  orders_count?: number | null
  errors?: unknown[]
  [key: string]: unknown
}

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier   — Borzo has no carrier management endpoints; it is a single-carrier last-mile platform
// Unavailable: warehouse — Borzo has no warehouse/fulfillment-centre endpoints
// Unavailable: manifest  — Borzo has no manifest/end-of-day closeout endpoints
// Unverified:  label     — GET /labels endpoint exists in API but response schema (field names) could not be confirmed from public docs

interface BorzoAdapterConfig {
  sandbox?: boolean
}

const SIMPLE_API_KEY_FORM = simpleApiKey()

export class BorzoAdapter implements LogisticsAdapter {
  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'borzo'
  readonly version = '1'
  // listOrders is the only list method, and it pages by `count` up to 50.
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  constructor(_config: BorzoAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new BorzoClient(credentials)
    const res = await client.get<BorzoOrderResponse>('/order', { order_id: id })
    const raw: BorzoOrder = res.order ?? {}
    return transformShipment(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new BorzoClient(credentials)

    const points: Array<{
      address: string
      contact_person?: { phone?: string; name?: string }
      note?: string
    }> = []

    if (data.originAddress) {
      const origin = data.originAddress
      points.push({
        address: [
          origin.street1,
          origin.street2,
          origin.city,
          origin.state,
          origin.postalCode,
          origin.country,
        ]
          .filter(Boolean)
          .join(', '),
        contact_person: {
          phone: origin.phone ?? undefined,
          name: origin.name ?? undefined,
        },
      })
    }

    if (data.destinationAddress) {
      const dest = data.destinationAddress
      points.push({
        address: [
          dest.street1,
          dest.street2,
          dest.city,
          dest.state,
          dest.postalCode,
          dest.country,
        ]
          .filter(Boolean)
          .join(', '),
        contact_person: {
          phone: dest.phone ?? undefined,
          name: dest.name ?? undefined,
        },
      })
    }

    const body = {
      matter: data.notes ?? 'Delivery',
      points,
    }

    const res = await client.post<BorzoOrderResponse>('/create-order', body)
    const raw: BorzoOrder = res.order ?? {}
    return transformShipment(raw)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new BorzoClient(credentials)
    await client.post<BorzoOrderResponse>('/cancel-order', { order_id: Number(id) })
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  // Paged by offset + count: https://borzodelivery.com/in/business-api/doc
  // ("List of orders") — "offset integer Number of orders to skip for
  // paginaton." / "count integer Maximum number of orders to be returned.
  // Cannot be higher than 50." / "orders_count integer Total number of found
  // orders for pagination."
  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new BorzoClient(credentials)
    const asked = Number(params.limit)
    const count =
      Number.isFinite(asked) && asked >= 1
        ? Math.min(Math.floor(asked), MAX_PAGE_SIZE)
        : DEFAULT_PAGE_SIZE
    const offset = pageOffset(params, count)
    const res = await client.get<BorzoOrdersResponse>('/orders', { offset, count })
    const orders: BorzoOrder[] = res.orders ?? []
    const total = typeof res.orders_count === 'number' ? res.orders_count : undefined
    reportUpstreamPage(params, {
      hasMore: total !== undefined ? offset + orders.length < total : orders.length === count,
      ...(total !== undefined ? { totalCount: total } : {}),
      pageSize: count,
    })
    return orders.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new BorzoClient(credentials)
    const res = await client.get<BorzoOrderResponse>('/order', { order_id: id })
    const raw: BorzoOrder = res.order ?? {}
    return transformOrder(raw)
  }

  async cancelOrder(credentials: Credentials, id: string): Promise<void> {
    return this.cancelShipment(credentials, id)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, orderId: string): Promise<TrackingEvent[]> {
    const client = new BorzoClient(credentials)
    const res = await client.get<BorzoOrderResponse>('/order', { order_id: orderId })
    const raw: BorzoOrder = res.order ?? {}
    return transformTracking(raw)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new BorzoClient(credentials)

    const originParts = [
      params.originAddress.street1,
      params.originAddress.city,
      params.originAddress.state,
      params.originAddress.postalCode,
      params.originAddress.country,
    ].filter(Boolean)

    const destParts = [
      params.destinationAddress.street1,
      params.destinationAddress.city,
      params.destinationAddress.state,
      params.destinationAddress.postalCode,
      params.destinationAddress.country,
    ].filter(Boolean)

    const body = {
      matter: 'Rate calculation',
      points: [
        { address: originParts.join(', ') },
        { address: destParts.join(', ') },
      ],
    }

    const res = await client.post<BorzoCalculateResponse>('/calculate-order', body)
    return [transformRate(res)]
  }
}

// ─── Order transform (inline — Borzo orders map 1:1 to shipments) ──────────

function transformOrder(raw: BorzoOrder): Order {
  const shipment = transformShipment(raw)
  const statusMap: Record<string, Order['status']> = {
    PENDING:    'PENDING',
    IN_TRANSIT: 'SHIPPED',
    DELIVERED:  'DELIVERED',
    CANCELLED:  'CANCELLED',
    UNKNOWN:    'PENDING',
  }
  return {
    id: shipment.id,
    status: statusMap[shipment.status ?? 'UNKNOWN'] ?? 'PENDING',
    orderNumber: raw.order_name ?? undefined,
    originAddress: shipment.originAddress,
    destinationAddress: shipment.destinationAddress,
    shippingAmount: shipment.cost?.amount,
    currency: 'INR',
    notes: shipment.notes,
    createdAt: shipment.createdAt,
    metadata: raw as Record<string, unknown>,
  }
}
