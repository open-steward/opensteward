import { simpleApiKey } from '@opensteward/shared'
import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
  RateRequestParams,
} from '../../adapter/interface'
import type { Shipment, ShipmentStatus } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Order } from '../../schema/order'
import type { Rate } from '../../schema/rate'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { ShypliteClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { transformTracking, type ShypliteTracking } from './transform/tracking'
import { transformOrder, type ShypliteOrder } from './transform/order'

// ── Resource coverage ──────────────────────────────────────────────
// Available:   order, trackingevent, shipment, rate
// Unverified:  carrier   — no carrier-list endpoint found in accessible v0 API docs (legacy SDK only exposes serviceability/rate-check)
// Unverified:  label     — only legacy api.shyplite.com/getSlip confirmed; no equivalent in app.shyplite.com/api/v0
// Unverified:  manifest  — only legacy api.shyplite.com/getManifestPDF confirmed; no v0 equivalent found
// Unverified:  warehouse — no warehouse/pickup-location listing endpoint found in any accessible documentation

interface ShypliteAdapterConfig {
  sandbox?: boolean
}

const SIMPLE_API_KEY_FORM = simpleApiKey()

interface ShypliteShipment {
  id?: string | number | null
  order_id?: string | null
  awb?: string | null
  carrier?: string | null
  service_code?: string | null
  status?: string | null
  reference?: string | null
  notes?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

function mapShipmentStatus(status: string | null | undefined): ShipmentStatus {
  if (!status) return 'UNKNOWN'
  const s = status.toLowerCase().trim()
  if (s === 'delivered') return 'DELIVERED'
  if (s.includes('out for delivery') || s.includes('out_for_delivery')) return 'OUT_FOR_DELIVERY'
  if (s.includes('in transit') || s.includes('in_transit') || s.includes('picked up') || s.includes('pickup done')) return 'IN_TRANSIT'
  if (s.includes('booked') || s.includes('pending') || s.includes('manifested') || s.includes('shipment created')) return 'PENDING'
  if (s.includes('rto') || s.includes('return to origin')) return 'RETURNED'
  if (s.includes('cancelled') || s.includes('canceled') || s.includes('lost')) return 'CANCELLED'
  return 'UNKNOWN'
}

function transformShipment(raw: ShypliteShipment): Shipment {
  return {
    id: raw.id != null ? String(raw.id) : (raw.order_id ?? undefined),
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.awb ?? undefined,
    carrierId: raw.carrier ?? 'shyplite',
    serviceCode: raw.service_code ?? undefined,
    reference: raw.reference ?? undefined,
    notes: raw.notes ?? undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

interface ShypliteRateOption {
  courier?: string | null
  courier_id?: string | null
  service_type?: string | null
  total_amount?: number | null
  currency?: string | null
  etd?: number | null
  [key: string]: unknown
}

export class ShypliteAdapter implements LogisticsAdapter {
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'shyplite'
  readonly version = '1'

  constructor(_config: ShypliteAdapterConfig = {}) {}

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

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(_payload: Buffer, _headers: Record<string, string>, _secret: string): boolean {
    return false
  }

  // ── Shipments ──────────────────────────────────────────────────────────────

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new ShypliteClient(credentials)
    const res = await client.get<{ data?: ShypliteShipment[]; shipments?: ShypliteShipment[] }>(
      '/shipments',
      {
        limit: params.limit ?? DEFAULT_PAGE_SIZE,
        page: params.cursor ? Number(params.cursor) : 1,
      },
    )
    const items = res.data ?? res.shipments ?? []
    return items.map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new ShypliteClient(credentials)
    const res = await client.get<{ data?: ShypliteShipment } | ShypliteShipment>(
      `/shipments/${encodeURIComponent(id)}`,
    )
    const raw = 'data' in res && res.data ? (res.data as ShypliteShipment) : (res as ShypliteShipment)
    return transformShipment(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new ShypliteClient(credentials)
    const body: Record<string, unknown> = {
      reference: data.reference,
      service_code: data.serviceCode,
      notes: data.notes,
    }

    if (data.destinationAddress) {
      body.consignee = {
        name: data.destinationAddress.name,
        address: data.destinationAddress.street1,
        city: data.destinationAddress.city,
        state: data.destinationAddress.state,
        pincode: data.destinationAddress.postalCode,
        phone: data.destinationAddress.phone,
      }
    }

    if (data.originAddress) {
      body.pickup_address = {
        name: data.originAddress.name,
        address: data.originAddress.street1,
        city: data.originAddress.city,
        state: data.originAddress.state,
        pincode: data.originAddress.postalCode,
        phone: data.originAddress.phone,
      }
    }

    if (data.totalWeight) {
      body.weight = data.totalWeight.value
    }

    const res = await client.post<{ data?: ShypliteShipment } | ShypliteShipment>('/shipments', body)
    const raw = 'data' in res && res.data ? (res.data as ShypliteShipment) : (res as ShypliteShipment)
    return transformShipment(raw)
  }

  // ── Orders ─────────────────────────────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new ShypliteClient(credentials)
    const res = await client.get<{ data?: ShypliteOrder[]; orders?: ShypliteOrder[] }>(
      '/orders',
      {
        limit: params.limit ?? DEFAULT_PAGE_SIZE,
        page: params.cursor ? Number(params.cursor) : 1,
      },
    )
    const items = res.data ?? res.orders ?? []
    return items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new ShypliteClient(credentials)
    const res = await client.get<{ data?: ShypliteOrder } | ShypliteOrder>(
      `/orders/${encodeURIComponent(id)}`,
    )
    const raw =
      'data' in res && res.data ? (res.data as ShypliteOrder) : (res as ShypliteOrder)
    return transformOrder(raw)
  }

  // ── Tracking Events ────────────────────────────────────────────────────────

  async listTrackingEvents(credentials: Credentials, params: QueryParams): Promise<TrackingEvent[]> {
    const trackingNumber =
      typeof params.trackingNumber === 'string'
        ? params.trackingNumber
        : typeof params.awb === 'string'
          ? params.awb
          : undefined
    if (!trackingNumber) return []
    return this.getTrackingEvents(credentials, trackingNumber)
  }

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new ShypliteClient(credentials)
    const res = await client.get<{ data?: ShypliteTracking } | ShypliteTracking>(
      `/tracking/${encodeURIComponent(trackingNumber)}`,
    )
    const raw = 'data' in res && res.data ? (res.data as ShypliteTracking) : (res as ShypliteTracking)
    return transformTracking(raw)
  }

  // ── Rates ──────────────────────────────────────────────────────────────────

  async getRates(credentials: Credentials, params: RateRequestParams): Promise<Rate[]> {
    const client = new ShypliteClient(credentials)
    const body: Record<string, unknown> = {
      origin_pincode: params.originAddress.postalCode,
      destination_pincode: params.destinationAddress.postalCode,
      weight: params.packages[0]?.weight?.value,
      cod: false,
    }

    const res = await client.post<{ data?: ShypliteRateOption[]; rates?: ShypliteRateOption[] }>(
      '/rates/check',
      body,
    )
    const items = res.data ?? res.rates ?? []
    return items.map((r) => ({
      carrierId: r.courier_id ?? r.courier ?? undefined,
      serviceName: r.courier ?? undefined,
      serviceCode: r.service_type ?? undefined,
      totalAmount: r.total_amount ?? undefined,
      currency: r.currency ?? 'INR',
      transitDays: r.etd ?? undefined,
      metadata: r as Record<string, unknown>,
    }))
  }
}
