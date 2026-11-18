import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── Yodel raw types ───────────────────────────────────────────────────────

export interface YodelTrackingEvent {
  event_code: string
  description: string | null
  timestamp: string
  location: string | null
  depot: string | null
  [key: string]: unknown
}

export interface YodelTrackingResponse {
  tracking_number: string
  status: string | null
  events: YodelTrackingEvent[]
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapTrackingStatus(eventCode: string): TrackingEventStatus {
  switch (eventCode) {
    case 'COLLECTED':        return 'PRE_TRANSIT'
    case 'IN_NETWORK':       return 'IN_TRANSIT'
    case 'WITH_DRIVER':      return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':        return 'DELIVERED'
    case 'CARDED':           return 'FAILURE'
    case 'RETURNED':         return 'RETURN_TO_SENDER'
    default:                 return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformTracking(raw: YodelTrackingResponse): TrackingEvent[] {
  const events: TrackingEvent[] = (raw.events ?? []).map((evt) => ({
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: 'yodel',
    status: mapTrackingStatus(evt.event_code),
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
      carrierId: 'yodel',
      status: 'UNKNOWN',
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
