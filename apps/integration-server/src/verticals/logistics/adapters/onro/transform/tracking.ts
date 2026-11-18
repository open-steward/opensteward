import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

export interface OnroOrder {
  id: string | number
  order_id?: string | null
  status?: string | null
  pickup_address?: Record<string, unknown> | null
  dropoff_address?: Record<string, unknown> | null
  created_at?: string | number | null
  updated_at?: string | number | null
  events?: OnroOrderEvent[] | null
  [key: string]: unknown
}

export interface OnroOrderEvent {
  status?: string | null
  description?: string | null
  timestamp?: string | number | null
  [key: string]: unknown
}

function mapStatus(status: string | null | undefined): TrackingEventStatus {
  if (!status) return 'UNKNOWN'
  const s = status.toLowerCase()
  if (s.includes('pickedup') || s.includes('picked_up') || s.includes('in_transit') || s.includes('on_the_way')) return 'IN_TRANSIT'
  if (s.includes('out_for_delivery') || s.includes('delivering') || s.includes('near_customer')) return 'OUT_FOR_DELIVERY'
  if (s.includes('delivered') || s.includes('completed')) return 'DELIVERED'
  if (s.includes('failed') || s.includes('undelivered') || s.includes('cancelled') || s.includes('canceled')) return 'FAILURE'
  if (s.includes('pending') || s.includes('created') || s.includes('assigned') || s.includes('accepted')) return 'PRE_TRANSIT'
  return 'UNKNOWN'
}

export function transformTracking(raw: OnroOrder): TrackingEvent[] {
  const orderId = String(raw.id)

  if (raw.events && raw.events.length > 0) {
    return raw.events.map((ev) => ({
      shipmentId: orderId,
      trackingNumber: raw.order_id ?? orderId,
      carrierId: 'onro',
      status: mapStatus(ev.status ?? raw.status),
      description: typeof ev.description === 'string' ? ev.description : undefined,
      occurredAt: toISODate(ev.timestamp),
      metadata: ev as Record<string, unknown>,
    }))
  }

  return [{
    shipmentId: orderId,
    trackingNumber: raw.order_id ?? orderId,
    carrierId: 'onro',
    status: mapStatus(raw.status),
    occurredAt: toISODate(raw.updated_at ?? raw.created_at),
    metadata: raw as Record<string, unknown>,
  }]
}
