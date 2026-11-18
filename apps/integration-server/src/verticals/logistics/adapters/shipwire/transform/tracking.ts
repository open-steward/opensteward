import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── Shipwire raw types ────────────────────────────────────────────────────

export interface ShipwireTrackingEvent {
  status: string
  description: string | null
  timestamp: string
  location: string | null
  carrier: string | null
  [key: string]: unknown
}

export interface ShipwireTrackingResponse {
  tracking_number: string
  order_id: string | null
  status: string | null
  events: ShipwireTrackingEvent[]
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapTrackingStatus(status: string): TrackingEventStatus {
  switch (status) {
    case 'submitted':          return 'PRE_TRANSIT'
    case 'processing':         return 'IN_TRANSIT'
    case 'in_transit':         return 'IN_TRANSIT'
    case 'out_for_delivery':   return 'OUT_FOR_DELIVERY'
    case 'delivered':          return 'DELIVERED'
    case 'returned':           return 'RETURN_TO_SENDER'
    case 'cancelled':          return 'FAILURE'
    default:                   return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformTracking(raw: ShipwireTrackingResponse): TrackingEvent[] {
  const events: TrackingEvent[] = (raw.events ?? []).map((evt) => ({
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: 'shipwire',
    status: mapTrackingStatus(evt.status),
    description: evt.description || undefined,
    location: evt.location
      ? { city: evt.location }
      : undefined,
    occurredAt: toISODate(evt.timestamp),
    metadata: evt as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber: raw.tracking_number ?? undefined,
      carrierId: 'shipwire',
      status: 'UNKNOWN',
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
