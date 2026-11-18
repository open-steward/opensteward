import { simpleApiKey } from '@opensteward/shared'
import type { LogisticsAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Shipment, ShipmentStatus } from '../../schema/shipment'
import type { TrackingEvent } from '../../schema/trackingevent'
import type { Order } from '../../schema/order'

import { buildAuthUrl, exchangeApiKey, refreshCredentials as doRefresh } from './auth'
import { OnroClient } from './client'
import { transformTracking, type OnroOrder } from './transform/tracking'
import { transformOrder } from './transform/order'
import { toAddress, toISODate } from '../shared/transform'

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: carrier  — Onro is a single-carrier last-mile platform with no external carrier management API
// Unavailable: manifest — Hub scanning is a UI-only feature; no public manifest API endpoint is documented
// Unverified:  label    — Label creation is mentioned in Shopify app listing but Postman API docs are JS-rendered and endpoint/fields could not be confirmed
// Unverified:  rate     — Pricing rules exist in the platform but Postman API docs are JS-rendered and rate endpoint could not be confirmed
// Unverified:  warehouse — Hub/warehouse concept exists but Postman API docs are JS-rendered and warehouse endpoint could not be confirmed

const SIMPLE_API_KEY_FORM = simpleApiKey()

// Onro order status → canonical ShipmentStatus
function mapShipmentStatus(status: string | null | undefined): ShipmentStatus {
  if (!status) return 'UNKNOWN'
  const s = status.toLowerCase()
  if (s.includes('pending') || s.includes('created') || s.includes('new')) return 'PENDING'
  if (s.includes('assigned') || s.includes('accepted')) return 'LABEL_CREATED'
  if (s.includes('pickedup') || s.includes('picked_up') || s.includes('in_transit') || s.includes('on_the_way')) return 'IN_TRANSIT'
  if (s.includes('out_for_delivery') || s.includes('delivering') || s.includes('near_customer')) return 'OUT_FOR_DELIVERY'
  if (s.includes('delivered') || s.includes('completed')) return 'DELIVERED'
  if (s.includes('cancelled') || s.includes('canceled') || s.includes('rejected')) return 'CANCELLED'
  if (s.includes('failed') || s.includes('undelivered')) return 'EXCEPTION'
  return 'UNKNOWN'
}

function transformShipment(raw: OnroOrder): Shipment {
  return {
    id: String(raw.id),
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.order_id ?? String(raw.id),
    carrierId: 'onro',
    originAddress: toAddress(raw.pickup_address as Record<string, unknown> | null),
    destinationAddress: toAddress(raw.dropoff_address as Record<string, unknown> | null),
    notes: typeof raw.notes === 'string' ? raw.notes : undefined,
    reference: typeof raw.reference_id === 'string' ? raw.reference_id : undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}

interface OnroOrderListResponse {
  data?: OnroOrder[]
  orders?: OnroOrder[]
}

export class OnroAdapter implements LogisticsAdapter {
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'onro'
  readonly version = '1'

  getAuthUrl(state: string): string { return buildAuthUrl(state) }
  async exchangeCode(code: string, _ru: string): Promise<Credentials> { return exchangeApiKey(code) }
  async refreshCredentials(c: Credentials): Promise<Credentials> { return doRefresh(c) }

  verifyWebhook(_payload: Buffer, _headers: Record<string, string>): boolean {
    return false
  }

  async listShipments(credentials: Credentials, params: QueryParams): Promise<Shipment[]> {
    const client = new OnroClient(credentials)
    const raw = await client.get<OnroOrderListResponse | OnroOrder[]>('orders', params as Record<string, unknown>)
    const orders: OnroOrder[] = Array.isArray(raw)
      ? raw
      : (raw.data ?? raw.orders ?? [])
    return orders.map(transformShipment)
  }

  async getShipment(credentials: Credentials, id: string): Promise<Shipment> {
    const client = new OnroClient(credentials)
    const raw = await client.get<OnroOrder>(`orders/${id}`)
    return transformShipment(raw)
  }

  async createShipment(credentials: Credentials, data: Partial<Shipment>): Promise<Shipment> {
    const client = new OnroClient(credentials)
    const body: Record<string, unknown> = {}
    if (data.originAddress) {
      body.pickup_address = {
        address: data.originAddress.street1,
        city: data.originAddress.city,
        name: data.originAddress.name,
        phone: data.originAddress.phone,
      }
    }
    if (data.destinationAddress) {
      body.dropoff_address = {
        address: data.destinationAddress.street1,
        city: data.destinationAddress.city,
        name: data.destinationAddress.name,
        phone: data.destinationAddress.phone,
      }
    }
    if (data.notes) body.notes = data.notes
    if (data.reference) body.reference_id = data.reference
    const raw = await client.post<OnroOrder>('orders', body)
    return transformShipment(raw)
  }

  async getTrackingEvents(credentials: Credentials, trackingNumber: string): Promise<TrackingEvent[]> {
    const client = new OnroClient(credentials)
    const raw = await client.get<OnroOrder>(`orders/${trackingNumber}`)
    return transformTracking(raw)
  }

  // ── Orders ─────────────────────────────────────────────────────────────────
  // Onro's order concept maps 1-to-1 with its delivery orders endpoint.

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new OnroClient(credentials)
    const raw = await client.get<OnroOrderListResponse | OnroOrder[]>('orders', params as Record<string, unknown>)
    const orders: OnroOrder[] = Array.isArray(raw)
      ? raw
      : (raw.data ?? raw.orders ?? [])
    return orders.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new OnroClient(credentials)
    const raw = await client.get<OnroOrder>(`orders/${id}`)
    return transformOrder(raw)
  }

  async cancelShipment(credentials: Credentials, id: string): Promise<void> {
    const client = new OnroClient(credentials)
    await client.post<unknown>(`orders/${id}/cancel`, {})
  }

  async cancelOrder(credentials: Credentials, id: string): Promise<void> {
    return this.cancelShipment(credentials, id)
  }
}
