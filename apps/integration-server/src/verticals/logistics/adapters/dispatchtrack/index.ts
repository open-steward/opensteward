import { customForm } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { Order } from '../../schema/order'
import type { TrackingEvent } from '../../schema/trackingevent'

import {
  buildAuthUrl,
  exchangeCredentials as doExchange,
  refreshCredentials as doRefresh,
} from './auth'
import { DispatchTrackClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import {
  transformServiceOrder,
  type DispatchTrackServiceOrder,
} from './transform/shipment'
import { transformHistoryEvents } from './transform/tracking'
import { transformOrderFromServiceOrder } from './transform/order'

// ── Resource coverage ──────────────────────────────────────────────────────────
// Available:   order, shipment, trackingevent
// Unavailable: carrier     — DispatchTrack is itself a last-mile fleet operator; no carrier-selection concept.
// Unavailable: label       — Service-order/dispatch model; no parcel label generation endpoint.
// Unavailable: manifest    — No carrier manifest concept; shipments are grouped into routes instead.
// Unavailable: rate        — No rate-shopping endpoint; DispatchTrack operates its own delivery fleet.
// Unverified:  warehouse   — store_code referenced on service orders suggests a stores endpoint may exist,
//                           but API docs are behind authentication and could not be verified.

// ── Credential form ───────────────────────────────────────────────────────────

const CREDENTIAL_FORM = customForm({
  fields: [
    {
      name: 'accountCode',
      label: 'Account code',
      type: 'text',
      required: true,
      placeholder: 'mycompany',
      helpText:
        'Your DispatchTrack subdomain — the part before .dispatchtrack.com.',
    },
    {
      name: 'apiKey',
      label: 'API key',
      type: 'password',
      required: true,
      helpText:
        'Find your API key in DispatchTrack under Settings → API.',
    },
  ],
  exchange: doExchange,
})

// ── Response wrappers ─────────────────────────────────────────────────────────

interface DtListResponse<T> {
  service_orders?: T[]
  dispatches?: T[]
  data?: T[]
  [key: string]: unknown
}

interface DtSingleResponse<T> {
  service_order?: T
  dispatch?: T
  data?: T
  [key: string]: unknown
}

function extractList<T>(res: DtListResponse<T>): T[] {
  return res.service_orders ?? res.dispatches ?? res.data ?? []
}

function extractSingle<T>(res: DtSingleResponse<T>): T | undefined {
  return res.service_order ?? res.dispatch ?? res.data ?? undefined
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class DispatchTrackAdapter implements LogisticsAdapter {
  // Connect Link support — custom form with accountCode + apiKey.
  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  readonly platform = 'dispatchtrack'
  readonly version = '1'

  // ── Auth ────────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // Not an OAuth2 platform — `code` is the raw API key (fallback path).
    return { accessToken: code }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Shipments (service orders) ───────────────────────────────────────────────

  /**
   * List service orders, optionally filtered by date.
   *
   * Query params supported:
   *   date   — ISO-8601 date string (YYYY-MM-DD) to fetch a specific day's orders
   *   limit  — max results (capped at MAX_PAGE_SIZE)
   *   page   — 1-based page number
   */
  async listShipments(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Shipment[]> {
    const client = new DispatchTrackClient(credentials)
    const extra = params as Record<string, unknown>
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<DtListResponse<DispatchTrackServiceOrder>>(
      'service_orders',
      {
        date: extra['date'],
        page: extra['page'] ?? 1,
        per_page: limit,
      },
    )
    return extractList(res).map(transformServiceOrder)
  }

  /**
   * Get a single service order by its ID or order number.
   */
  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new DispatchTrackClient(credentials)
    const res = await client.get<DtSingleResponse<DispatchTrackServiceOrder>>(
      `service_orders/${encodeURIComponent(id)}`,
    )
    const raw = extractSingle(res)
    if (!raw) throw new Error(`DispatchTrack: service order not found: ${id}`)
    return transformServiceOrder(raw)
  }

  /**
   * Create a new service order (dispatch).
   *
   * Maps Shipment fields onto the DispatchTrack dispatch payload.
   */
  async createShipment(
    credentials: Credentials,
    data: Partial<Shipment>,
  ): Promise<Shipment> {
    const client = new DispatchTrackClient(credentials)
    const body: Record<string, unknown> = {
      identifier: data.reference ?? data.trackingNumber,
      contact_name: data.destinationAddress?.name,
      contact_address: data.destinationAddress?.street1,
      contact_phone: data.destinationAddress?.phone,
      contact_email: data.destinationAddress?.email,
      notes: data.notes,
    }
    if (data.estimatedDeliveryAt) {
      body['request_delivery_date'] = data.estimatedDeliveryAt.toISOString()
    }
    if (data.warehouseId) {
      body['store_code'] = data.warehouseId
    }
    const res = await client.post<DtSingleResponse<DispatchTrackServiceOrder>>(
      'service_orders',
      { service_order: body },
    )
    const raw = extractSingle(res)
    if (!raw) throw new Error('DispatchTrack: failed to create service order')
    return transformServiceOrder(raw)
  }

  /**
   * Cancel a service order by ID.
   */
  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new DispatchTrackClient(credentials)
    await client.delete(`service_orders/${encodeURIComponent(id)}`)
  }

  // ── Orders (same resource — service orders — with an order lens) ─────────────

  async listOrders(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Order[]> {
    const client = new DispatchTrackClient(credentials)
    const extra = params as Record<string, unknown>
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<DtListResponse<DispatchTrackServiceOrder>>(
      'service_orders',
      {
        date: extra['date'],
        page: extra['page'] ?? 1,
        per_page: limit,
      },
    )
    return extractList(res).map(transformOrderFromServiceOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new DispatchTrackClient(credentials)
    const res = await client.get<DtSingleResponse<DispatchTrackServiceOrder>>(
      `service_orders/${encodeURIComponent(id)}`,
    )
    const raw = extractSingle(res)
    if (!raw) throw new Error(`DispatchTrack: service order not found: ${id}`)
    return transformOrderFromServiceOrder(raw)
  }

  async createOrder(
    credentials: Credentials,
    data: Partial<Order>,
  ): Promise<Order> {
    const client = new DispatchTrackClient(credentials)
    const body: Record<string, unknown> = {
      identifier: data.orderNumber,
      contact_name: data.destinationAddress?.name,
      contact_address: data.destinationAddress?.street1,
      contact_phone: data.destinationAddress?.phone,
      contact_email: data.destinationAddress?.email,
      notes: data.notes,
      store_code: data.warehouseId,
      items: (data.lineItems ?? []).map((li) => ({
        code: li.sku,
        description: li.name,
        quantity: li.quantity,
      })),
    }
    const res = await client.post<DtSingleResponse<DispatchTrackServiceOrder>>(
      'service_orders',
      { service_order: body },
    )
    const raw = extractSingle(res)
    if (!raw) throw new Error('DispatchTrack: failed to create order')
    return transformOrderFromServiceOrder(raw)
  }

  async cancelOrder(credentials: Credentials, id: string): Promise<void> {
    const client = new DispatchTrackClient(credentials)
    await client.delete(`service_orders/${encodeURIComponent(id)}`)
  }

  // ── Tracking events ──────────────────────────────────────────────────────────

  /**
   * Retrieve tracking-event history for a specific service order.
   * The `trackingNumber` may be the numeric order ID or the customer-supplied
   * identifier / reference number.
   */
  async getTrackingEvents(
    credentials: Credentials,
    trackingNumber: string,
  ): Promise<TrackingEvent[]> {
    const client = new DispatchTrackClient(credentials)
    const res = await client.get<DtSingleResponse<DispatchTrackServiceOrder>>(
      `service_orders/${encodeURIComponent(trackingNumber)}`,
    )
    const raw = extractSingle(res)
    if (!raw) return []
    return transformHistoryEvents(raw)
  }

  /**
   * List tracking events across recent service orders.
   * Fetches the day's orders and expands their event history.
   */
  async listTrackingEvents(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<TrackingEvent[]> {
    const client = new DispatchTrackClient(credentials)
    const extra = params as Record<string, unknown>
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<DtListResponse<DispatchTrackServiceOrder>>(
      'service_orders',
      {
        date: extra['date'],
        page: extra['page'] ?? 1,
        per_page: limit,
      },
    )
    return extractList(res).flatMap(transformHistoryEvents)
  }
}
