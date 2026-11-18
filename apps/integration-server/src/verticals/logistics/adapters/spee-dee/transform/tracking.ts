import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── Spee-Dee raw types ──────────────────────────────────────────────────

export interface SpeeDeeTrackingEvent {
  status: string
  description: string | null
  timestamp: string
  city: string | null
  state: string | null
  zip: string | null
  [key: string]: unknown
}

export interface SpeeDeeTrackingResponse {
  trackingNumber: string
  status: string | null
  events: SpeeDeeTrackingEvent[]
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapTrackingStatus(status: string): TrackingEventStatus {
  switch (status) {
    case 'PICKED_UP':        return 'PRE_TRANSIT'
    case 'IN_TRANSIT':       return 'IN_TRANSIT'
    case 'OUT_FOR_DELIVERY': return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':        return 'DELIVERED'
    case 'EXCEPTION':        return 'FAILURE'
    case 'RETURNED':         return 'RETURN_TO_SENDER'
    default:                 return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformTracking(raw: SpeeDeeTrackingResponse): TrackingEvent[] {
  const events: TrackingEvent[] = (raw.events ?? []).map((evt) => ({
    trackingNumber: raw.trackingNumber ?? undefined,
    carrierId: 'spee-dee',
    status: mapTrackingStatus(evt.status),
    description: evt.description || undefined,
    location: evt.city
      ? { city: evt.city, state: evt.state ?? undefined, postalCode: evt.zip ?? undefined }
      : undefined,
    occurredAt: toISODate(evt.timestamp),
    metadata: evt as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber: raw.trackingNumber ?? undefined,
      carrierId: 'spee-dee',
      status: 'UNKNOWN',
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
