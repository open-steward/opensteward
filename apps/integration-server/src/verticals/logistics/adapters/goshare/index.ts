// ── Resource coverage ──────────────────────────────────────────────
// Available:   trackingevent, shipment, order
// Unavailable: carrier — GoShare is a single-carrier dispatch platform; no carrier listing endpoint
// Unavailable: label — GoShare is a courier-dispatch service, not a label-printing platform
// Unavailable: manifest — no manifest concept or endpoint in the GoShare API
// Unavailable: warehouse — no warehouse endpoint in the GoShare API
// Unverified:  rate — /v1/projects/estimate endpoint confirmed but response field names require auth-gated docs

import type {
  LogisticsAdapter,
  Credentials,
  QueryParams,
} from '../../adapter/interface'
import type { Shipment, ShipmentStatus } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Order } from '../../schema/order'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh, GOSHARE_FORM } from './auth'
import { GoshareClient } from './client'
import { transformTracking, type GoshareDelivery } from './transform/tracking'
import { deliveryToOrder } from './transform/order'
import { toAddress, toISODate } from '../shared/transform'

function mapShipmentStatus(status: string | null | undefined): ShipmentStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'pending':
    case 'created':
    case 'searching_driver':   return 'LABEL_CREATED'
    case 'driver_assigned':
    case 'driver_accepted':
    case 'driver_en_route':
    case 'picked_up':
    case 'in_transit':         return 'IN_TRANSIT'
    case 'out_for_delivery':
    case 'arriving_soon':      return 'OUT_FOR_DELIVERY'
    case 'delivered':
    case 'completed':          return 'DELIVERED'
    case 'returned':
    case 'return_to_sender':   return 'RETURNED'
    case 'cancelled':
    case 'canceled':           return 'CANCELLED'
    case 'failed':
    case 'undeliverable':      return 'EXCEPTION'
    default:                   return 'UNKNOWN'
  }
}

function deliveryToShipment(raw: GoshareDelivery): Shipment {
  return {
    id: raw.id,
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.tracking_number ?? raw.id,
    carrierId: 'goshare',
    originAddress: toAddress(raw.pickup_address ?? null),
    destinationAddress: toAddress(raw.delivery_address ?? null),
    estimatedDeliveryAt: toISODate(raw.estimated_delivery_at),
    actualDeliveryAt: toISODate(raw.delivered_at),
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    mode: 'parcel',
    metadata: raw as Record<string, unknown>,
  }
}

interface GoshareDeliveryListResponse {
  data: GoshareDelivery[]
  meta?: {
    total?: number
    page?: number
    per_page?: number
  }
}

export class GoshareAdapter implements LogisticsAdapter {
  readonly platform = 'goshare'
  readonly version = '1'

  credentialFields = GOSHARE_FORM.credentialFields
  exchangeCredentials = GOSHARE_FORM.exchangeCredentials

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeApiKey(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new GoshareClient(credentials)
    const query: Record<string, unknown> = {}
    if (params.page != null) query['page'] = params.page
    if (params.limit != null) query['per_page'] = params.limit
    if (params.updatedAfter != null) query['updated_after'] = params.updatedAfter.toISOString()

    const res = await client.get<GoshareDeliveryListResponse>('/deliveries', query)
    return (res.data ?? []).map(deliveryToShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new GoshareClient(credentials)
    const raw = await client.get<GoshareDelivery>(`/deliveries/${id}`)
    return deliveryToShipment(raw)
  }

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new GoshareClient(credentials)
    const raw = await client.get<GoshareDelivery>(`/deliveries/${trackingNumber}`)
    return transformTracking(raw)
  }

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new GoshareClient(credentials)
    const query: Record<string, unknown> = {}
    if (params.page != null) query['page'] = params.page
    if (params.limit != null) query['per_page'] = params.limit
    if (params.updatedAfter != null) query['updated_after'] = params.updatedAfter.toISOString()

    const res = await client.get<GoshareDeliveryListResponse>('/deliveries', query)
    return (res.data ?? []).map(deliveryToOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new GoshareClient(credentials)
    const raw = await client.get<GoshareDelivery>(`/deliveries/${id}`)
    return deliveryToOrder(raw)
  }

  verifyWebhook(_payload: Buffer, _headers: Record<string, string>, _secret: string): boolean {
    return false
  }
}
