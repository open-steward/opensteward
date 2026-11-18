// ── Resource coverage ──────────────────────────────────────────────
// Available:   shipment, trackingevent
// Unverified:  carrier   — developer.fareyeconnect.com requires authenticated access; no public endpoint or field-level docs available
// Unverified:  label     — ClickPost confirms a label/manifestation API exists but endpoint path and response shape are behind authenticated portal
// Unverified:  manifest  — ClickPost confirms a manifestation API exists but endpoint path and response shape are behind authenticated portal
// Unverified:  order     — ClickPost confirms order creation/cancellation API exists but endpoint path and response shape are behind authenticated portal
// Unverified:  rate      — Portal homepage references rate shopping; ClickPost references EDD API; endpoint path and response shape unconfirmed
// Unverified:  warehouse — developer.fareyeconnect.com requires authenticated access; no public endpoint or field-level docs available

import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
} from '../../adapter/interface'
import type { Shipment } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'

import {
  buildAuthUrl as doBuildAuthUrl,
  exchangeCode as doExchangeCode,
  refreshCredentials as doRefresh,
} from './auth'
import { FareyeClient } from './client'
import {
  transformTrackingEvents,
  type FareyeShipmentTrackingResponse,
  type FareyeTrackingListResponse,
} from './transform/tracking'

export interface FareyeAdapterConfig {
  clientId?: string
  clientSecret?: string
  redirectUri?: string
}

interface FareyeShipmentRaw {
  shipmentId?: string
  trackingNumber?: string
  carrierId?: string
  serviceCode?: string
  status?: string
  reference?: string
  origin?: {
    city?: string
    state?: string
    postalCode?: string
    country?: string
    street1?: string
    street2?: string
    [key: string]: unknown
  }
  destination?: {
    city?: string
    state?: string
    postalCode?: string
    country?: string
    street1?: string
    street2?: string
    [key: string]: unknown
  }
  estimatedDeliveryAt?: string
  actualDeliveryAt?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

interface FareyeShipmentsListRaw {
  shipments: FareyeShipmentRaw[]
  totalCount?: number
  [key: string]: unknown
}

const STATUS_MAP: Record<string, Shipment['status']> = {
  CREATED: 'PENDING',
  PICKUP_SCHEDULED: 'PENDING',
  PICKED_UP: 'IN_TRANSIT',
  IN_TRANSIT: 'IN_TRANSIT',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  DELIVERY_FAILED: 'EXCEPTION',
  EXCEPTION: 'EXCEPTION',
  RETURNED: 'RETURNED',
  CANCELLED: 'CANCELLED',
}

function rawToShipment(raw: FareyeShipmentRaw): Shipment {
  const status = raw.status
    ? (STATUS_MAP[raw.status.toUpperCase().replace(/\s+/g, '_')] ?? 'UNKNOWN')
    : 'UNKNOWN'

  return {
    id: raw.shipmentId ?? undefined,
    trackingNumber: raw.trackingNumber ?? undefined,
    carrierId: raw.carrierId ?? undefined,
    serviceCode: raw.serviceCode ?? undefined,
    status,
    reference: raw.reference ?? undefined,
    originAddress: raw.origin
      ? {
          city: raw.origin.city,
          state: raw.origin.state,
          postalCode: raw.origin.postalCode,
          country: raw.origin.country,
          street1: raw.origin.street1,
          street2: raw.origin.street2,
        }
      : undefined,
    destinationAddress: raw.destination
      ? {
          city: raw.destination.city,
          state: raw.destination.state,
          postalCode: raw.destination.postalCode,
          country: raw.destination.country,
          street1: raw.destination.street1,
          street2: raw.destination.street2,
        }
      : undefined,
    estimatedDeliveryAt: raw.estimatedDeliveryAt ? new Date(raw.estimatedDeliveryAt) : undefined,
    actualDeliveryAt: raw.actualDeliveryAt ? new Date(raw.actualDeliveryAt) : undefined,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export class FareyeAdapter implements LogisticsAdapter {
  readonly platform = 'fareye'
  readonly version = '1'

  private config: FareyeAdapterConfig

  constructor(config: FareyeAdapterConfig = {}) {
    this.config = config
  }

  // ── Auth ─────────────────────────────────────────────────────────────────────

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    if (!this.config.clientId || !this.config.redirectUri) {
      throw new Error('fareye: clientId and redirectUri are required to build auth URL')
    }
    return doBuildAuthUrl(state, this.config.redirectUri, this.config.clientId, overrideScopes)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new Error('fareye: clientId and clientSecret are required')
    }
    return doExchangeCode(code, redirectUri, {
      clientId: this.config.clientId,
      clientSecret: this.config.clientSecret,
      redirectUri,
    })
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // ── Shipments ─────────────────────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new FareyeClient(credentials)
    const res = await client.get<FareyeShipmentsListRaw>('/shipments', {
      page: params.page,
      limit: params.limit,
    })
    return (res.shipments ?? []).map(rawToShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new FareyeClient(credentials)
    const raw = await client.get<FareyeShipmentRaw>(`/shipments/${id}`)
    return rawToShipment(raw)
  }

  // ── Tracking Events ───────────────────────────────────────────────────────────

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new FareyeClient(credentials)
    const res = await client.get<FareyeShipmentTrackingResponse>(`/tracking/${trackingNumber}`)
    return transformTrackingEvents(res)
  }

  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    const client = new FareyeClient(credentials)
    const res = await client.get<FareyeTrackingListResponse>('/tracking', {
      page: params.page,
      limit: params.limit,
    })
    return (res.shipments ?? []).flatMap(transformTrackingEvents)
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────────

  verifyWebhook(_payload: Buffer, _headers: Record<string, string>, _secret: string): boolean {
    return false
  }
}
