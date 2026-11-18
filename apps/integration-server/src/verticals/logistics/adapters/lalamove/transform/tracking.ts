import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── Lalamove raw types ────────────────────────────────────────────────────

export interface LalamoveOrderEvent {
  status: string
  description: string | null
  timestamp: string
  driver_name: string | null
  [key: string]: unknown
}

export interface LalamoveOrderResponse {
  orderId: string
  status: string | null
  events: LalamoveOrderEvent[]
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapTrackingStatus(status: string): TrackingEventStatus {
  switch (status) {
    case 'ASSIGNING_DRIVER': return 'PRE_TRANSIT'
    case 'ON_GOING':         return 'IN_TRANSIT'
    case 'PICKED_UP':        return 'IN_TRANSIT'
    case 'COMPLETED':        return 'DELIVERED'
    case 'CANCELLED':        return 'FAILURE'
    case 'EXPIRED':          return 'FAILURE'
    case 'REJECTED':         return 'FAILURE'
    default:                 return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformTracking(raw: LalamoveOrderResponse): TrackingEvent[] {
  const events: TrackingEvent[] = (raw.events ?? []).map((evt) => ({
    trackingNumber: raw.orderId ?? undefined,
    carrierId: 'lalamove',
    status: mapTrackingStatus(evt.status),
    description: evt.description || undefined,
    occurredAt: toISODate(evt.timestamp),
    metadata: evt as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber: raw.orderId ?? undefined,
      carrierId: 'lalamove',
      status: mapTrackingStatus(raw.status ?? ''),
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
