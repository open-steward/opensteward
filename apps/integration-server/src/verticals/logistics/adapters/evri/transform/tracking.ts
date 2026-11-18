import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── Evri raw types ─────────────────────────────────────────────────────────

export interface EvriTrackingEvent {
  event_code: string
  event_description: string | null
  timestamp: string
  location: string | null
  depot: string | null
  [key: string]: unknown
}

export interface EvriTrackingResponse {
  tracking_number: string
  status: string | null
  events: EvriTrackingEvent[]
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapTrackingStatus(eventCode: string): TrackingEventStatus {
  switch (eventCode) {
    case 'collected':          return 'PRE_TRANSIT'
    case 'hub_scan':           return 'IN_TRANSIT'
    case 'out_for_delivery':   return 'OUT_FOR_DELIVERY'
    case 'delivered':          return 'DELIVERED'
    case 'attempted_delivery': return 'FAILURE'
    case 'returned':           return 'RETURN_TO_SENDER'
    default:                   return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformTracking(raw: EvriTrackingResponse): TrackingEvent[] {
  const events: TrackingEvent[] = (raw.events ?? []).map((evt) => ({
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: 'evri',
    status: mapTrackingStatus(evt.event_code),
    description: evt.event_description || undefined,
    location: evt.location
      ? { city: evt.location }
      : undefined,
    occurredAt: toISODate(evt.timestamp),
    metadata: evt as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber: raw.tracking_number ?? undefined,
      carrierId: 'evri',
      status: 'UNKNOWN',
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
