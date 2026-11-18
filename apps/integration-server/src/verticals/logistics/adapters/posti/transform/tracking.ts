import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── Posti raw types ───────────────────────────────────────────────────────

export interface PostiTrackingEvent {
  event_code: string
  description: string | null
  timestamp: string
  location: string | null
  postal_code: string | null
  country: string | null
  [key: string]: unknown
}

export interface PostiTrackingResponse {
  tracking_code: string
  status: string | null
  events: PostiTrackingEvent[]
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapTrackingStatus(eventCode: string): TrackingEventStatus {
  switch (eventCode) {
    case 'REGISTERED':         return 'PRE_TRANSIT'
    case 'IN_TRANSPORT':       return 'IN_TRANSIT'
    case 'OUT_FOR_DELIVERY':   return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':          return 'DELIVERED'
    case 'DELIVERY_ATTEMPT':   return 'FAILURE'
    case 'RETURNED':           return 'RETURN_TO_SENDER'
    case 'READY_FOR_PICKUP':   return 'AVAILABLE_FOR_PICKUP'
    default:                   return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformTracking(raw: PostiTrackingResponse): TrackingEvent[] {
  const events: TrackingEvent[] = (raw.events ?? []).map((evt) => ({
    trackingNumber: raw.tracking_code ?? undefined,
    carrierId: 'posti',
    status: mapTrackingStatus(evt.event_code),
    description: evt.description || undefined,
    location: evt.location
      ? { city: evt.location, postalCode: evt.postal_code ?? undefined, country: evt.country ?? undefined }
      : undefined,
    occurredAt: toISODate(evt.timestamp),
    metadata: evt as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber: raw.tracking_code ?? undefined,
      carrierId: 'posti',
      status: 'UNKNOWN',
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
