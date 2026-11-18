/**
 * Shipsy logistics adapter.
 *
 * Shipsy is a logistics management and automation platform used primarily
 * across South and Southeast Asia. This adapter covers:
 *   - Shipments (list, get)
 *   - Tracking events (list, get by shipment ID)
 *
 * Auth: API key passed as the Authorization header (no Bearer prefix).
 * Credentials are obtained from the Shipsy dashboard.
 *
 * Docs: https://developer.shipsy.io
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unverified: carrier   — Shipsy API docs are behind authentication (apiplayground.shipsy.in returns 403); no public endpoint for carriers confirmed.
// Unverified: label     — Shipsy API docs are behind authentication (apiplayground.shipsy.in returns 403); no public endpoint for labels confirmed.
// Unverified: manifest  — Shipsy API docs are behind authentication (apiplayground.shipsy.in returns 403); no public endpoint for manifests confirmed.
// Unverified: order     — Shipsy API docs are behind authentication (apiplayground.shipsy.in returns 403); no public endpoint for orders confirmed.
// Unverified: rate      — Shipsy API docs are behind authentication (apiplayground.shipsy.in returns 403); no public endpoint for rates confirmed.
// Unverified: warehouse — Shipsy API docs are behind authentication (apiplayground.shipsy.in returns 403); no public endpoint for warehouses confirmed.
import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { ShipsyClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import {
  transformTracking,
  type ShipsyShipment,
} from './transform/tracking'

// ─── Raw response types ───────────────────────────────────────────────────────

interface ShipsyListResponse<T> {
  data?: T[]
  results?: T[]
  shipments?: T[]
  [key: string]: unknown
}

interface ShipsyShipmentResponse {
  data?: ShipsyShipment
  [key: string]: unknown
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function unwrapList<T>(res: ShipsyListResponse<T> | T[]): T[] {
  if (Array.isArray(res)) return res
  return res.data ?? res.results ?? res.shipments ?? []
}

function mapShipmentStatus(
  status: string | undefined,
): Shipment['status'] {
  switch ((status ?? '').toUpperCase()) {
    case 'PENDING':
    case 'CREATED':
    case 'BOOKED':
      return 'PENDING'
    case 'PICKED_UP':
    case 'IN_TRANSIT':
    case 'DISPATCHED':
      return 'IN_TRANSIT'
    case 'OUT_FOR_DELIVERY':
      return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':
      return 'DELIVERED'
    case 'RETURNED':
    case 'RTO':
      return 'RETURNED'
    case 'FAILED':
    case 'CANCELLED':
      return 'CANCELLED'
    default:
      return 'UNKNOWN'
  }
}

function transformShipment(raw: ShipsyShipment): Shipment {
  return {
    id: raw.shipment_id ?? (raw.id != null ? String(raw.id) : undefined),
    trackingNumber: raw.tracking_number,
    carrierId: 'shipsy',
    status: mapShipmentStatus(raw.status),
    originAddress: raw.origin_city ? { city: raw.origin_city } : undefined,
    destinationAddress: raw.destination_city ? { city: raw.destination_city } : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at as string) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at as string) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

// ─── Connect Link credential form ────────────────────────────────────────────

const SIMPLE_API_KEY_FORM = simpleApiKey({
  helpText: 'Your Shipsy API key, found in the Shipsy dashboard under Settings → API.',
})

// ─── Adapter ─────────────────────────────────────────────────────────────────

export class ShipsyAdapter implements LogisticsAdapter {
  readonly platform = 'shipsy'
  readonly version = '1'

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  // ── Auth ──────────────────────────────────────────────────────────────────

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  verifyWebhook(_payload: Buffer, _headers: Record<string, string>, _secret: string): boolean {
    return false
  }

  // ── Shipments ─────────────────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new ShipsyClient(credentials)
    const res = await client.get<ShipsyListResponse<ShipsyShipment>>('/shipments', {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
      page: params.page ?? 1,
      ...(params.updatedAfter ? { updated_after: (params.updatedAfter as Date).toISOString() } : {}),
    })
    return unwrapList(res).map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new ShipsyClient(credentials)
    const res = await client.get<ShipsyShipmentResponse | ShipsyShipment>(
      `/shipments/${encodeURIComponent(id)}`,
    )
    const raw = ('data' in res && res.data && typeof res.data === 'object')
      ? (res.data as ShipsyShipment)
      : (res as ShipsyShipment)
    return transformShipment(raw)
  }

  // ── Tracking Events ───────────────────────────────────────────────────────

  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    const client = new ShipsyClient(credentials)
    const res = await client.get<ShipsyListResponse<ShipsyShipment>>('/shipments', {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
      page: params.page ?? 1,
    })
    return unwrapList(res).flatMap((s) => transformTracking(s))
  }

  async getTrackingEvents(credentials: Credentials, shipmentId: string): Promise<TrackingEvent[]> {
    const client = new ShipsyClient(credentials)
    const res = await client.get<ShipsyShipmentResponse | ShipsyShipment>(
      `/shipments/${encodeURIComponent(shipmentId)}`,
    )
    const raw = ('data' in res && res.data && typeof res.data === 'object')
      ? (res.data as ShipsyShipment)
      : (res as ShipsyShipment)
    return transformTracking(raw)
  }
}
