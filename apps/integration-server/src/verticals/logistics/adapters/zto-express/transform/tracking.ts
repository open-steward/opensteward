import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── ZTO Express raw types ─────────────────────────────────────────────────

export interface ZtoExpressTrackingEvent {
  status: string
  description: string | null
  timestamp: string
  location: string | null
  [key: string]: unknown
}

export interface ZtoExpressTrackingResponse {
  tracking_number: string
  status: string | null
  events: ZtoExpressTrackingEvent[]
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapTrackingStatus(status: string): TrackingEventStatus {
  switch (status) {
    case 'COLLECTED':  return 'PRE_TRANSIT'
    case 'IN_TRANSIT': return 'IN_TRANSIT'
    case 'DELIVERING': return 'OUT_FOR_DELIVERY'
    case 'SIGNED':     return 'DELIVERED'
    case 'PROBLEM':    return 'FAILURE'
    case 'RETURNED':   return 'RETURN_TO_SENDER'
    default:           return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformTracking(raw: ZtoExpressTrackingResponse): TrackingEvent[] {
  const events: TrackingEvent[] = (raw.events ?? []).map((evt) => ({
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: 'zto-express',
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
      carrierId: 'zto-express',
      status: 'UNKNOWN',
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
