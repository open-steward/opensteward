// ── Resource coverage ──────────────────────────────────────────────
// Available:   shipment, trackingevent
// Unverified:  carrier    — Wakeo API docs are password-protected; platform is visibility-only with no documented carrier-management endpoints
// Unverified:  label      — Wakeo API docs are password-protected; platform has no label generation capability per public documentation
// Unverified:  manifest   — Wakeo API docs are password-protected; platform has no manifest creation capability per public documentation
// Unverified:  order      — Wakeo API docs are password-protected; platform ingests orders from TMS/ERP but exposes no order-management API
// Unverified:  rate       — Wakeo API docs are password-protected; platform has no rate shopping capability per public documentation
// Unverified:  warehouse  — Wakeo API docs are password-protected; platform has no warehouse management capability per public documentation

import { simpleApiKey } from '@opensteward/shared'
import type { LogisticsAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Shipment, ShipmentStatus, ShipmentMode } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { WakeoClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { transformTrackingEvent, type WakeoTrackingEvent } from './transform/tracking'
import { toISODate } from '../shared/transform'

interface WakeoShipment {
  id?: string
  status?: string
  trackingNumber?: string
  referenceNumber?: string
  mode?: string
  carrierId?: string
  origin?: {
    name?: string
    city?: string
    state?: string
    postalCode?: string
    country?: string
    portCode?: string
    [key: string]: unknown
  }
  destination?: {
    name?: string
    city?: string
    state?: string
    postalCode?: string
    country?: string
    portCode?: string
    [key: string]: unknown
  }
  estimatedArrival?: string
  actualArrival?: string
  createdAt?: string
  updatedAt?: string
  notes?: string
  [key: string]: unknown
}

interface WakeoShipmentsListResponse {
  shipments?: WakeoShipment[]
  [key: string]: unknown
}

interface WakeoShipmentResponse {
  shipment?: WakeoShipment
  [key: string]: unknown
}

interface WakeoTrackingEventsResponse {
  events?: WakeoTrackingEvent[]
  [key: string]: unknown
}

interface WakeoAdapterConfig {
  [key: string]: unknown
}

const SIMPLE_API_KEY_FORM = simpleApiKey()

function mapShipmentStatus(status: string | undefined): ShipmentStatus {
  switch (status) {
    case 'booked':            return 'PENDING'
    case 'in_transit':        return 'IN_TRANSIT'
    case 'out_for_delivery':  return 'OUT_FOR_DELIVERY'
    case 'delivered':         return 'DELIVERED'
    case 'exception':         return 'EXCEPTION'
    case 'cancelled':         return 'CANCELLED'
    default:                  return 'UNKNOWN'
  }
}

function mapShipmentMode(mode: string | undefined): ShipmentMode {
  switch (mode) {
    case 'ocean': return 'ocean'
    case 'air':   return 'air'
    case 'road':  return 'parcel'
    case 'rail':  return 'rail'
    default:      return 'unknown'
  }
}

function transformShipment(raw: WakeoShipment): Shipment {
  return {
    id: raw.id,
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.trackingNumber,
    carrierId: raw.carrierId,
    mode: mapShipmentMode(raw.mode),
    originAddress: raw.origin
      ? {
          name: raw.origin.name,
          city: raw.origin.city,
          state: raw.origin.state,
          postalCode: raw.origin.postalCode,
          country: raw.origin.country,
        }
      : undefined,
    destinationAddress: raw.destination
      ? {
          name: raw.destination.name,
          city: raw.destination.city,
          state: raw.destination.state,
          postalCode: raw.destination.postalCode,
          country: raw.destination.country,
        }
      : undefined,
    estimatedDeliveryAt: toISODate(raw.estimatedArrival),
    actualDeliveryAt: toISODate(raw.actualArrival),
    reference: raw.referenceNumber,
    notes: raw.notes,
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}

export class WakeoAdapter implements LogisticsAdapter {
  readonly platform = 'wakeo'
  readonly version = '1'

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  constructor(_config: WakeoAdapterConfig = {}) {}

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

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new WakeoClient(credentials)
    const res = await client.get<WakeoShipmentsListResponse>('/shipments', {
      page: (params as Record<string, unknown>).page ?? 1,
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
    })
    return (res.shipments ?? []).map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new WakeoClient(credentials)
    const res = await client.get<WakeoShipmentResponse>(`/shipments/${id}`)
    const raw = res.shipment ?? (res as unknown as WakeoShipment)
    return transformShipment(raw)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new WakeoClient(credentials)
    const res = await client.get<WakeoTrackingEventsResponse>(`/shipments/${trackingNumber}/events`)
    return (res.events ?? []).map((e) => transformTrackingEvent(e, trackingNumber))
  }

  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    const client = new WakeoClient(credentials)
    const res = await client.get<WakeoTrackingEventsResponse>('/tracking/events', {
      page: (params as Record<string, unknown>).page ?? 1,
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
    })
    return (res.events ?? []).map((e) => transformTrackingEvent(e))
  }
}
