import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── R+L Carriers raw types ────────────────────────────────────────────────

export interface RplusLTrackingEvent {
  status_code: string
  description: string | null
  timestamp: string
  city: string | null
  state: string | null
  [key: string]: unknown
}

export interface RplusLTrackingResponse {
  pro_number: string
  status: string | null
  events: RplusLTrackingEvent[]
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapTrackingStatus(code: string): TrackingEventStatus {
  switch (code) {
    case 'P':    return 'PRE_TRANSIT'
    case 'T':    return 'IN_TRANSIT'
    case 'O':    return 'OUT_FOR_DELIVERY'
    case 'D':    return 'DELIVERED'
    case 'X':    return 'FAILURE'
    default:     return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformTracking(raw: RplusLTrackingResponse): TrackingEvent[] {
  const events: TrackingEvent[] = (raw.events ?? []).map((evt) => ({
    trackingNumber: raw.pro_number ?? undefined,
    carrierId: 'rplust',
    status: mapTrackingStatus(evt.status_code),
    description: evt.description || undefined,
    location: evt.city
      ? { city: evt.city, state: evt.state ?? undefined }
      : undefined,
    occurredAt: toISODate(evt.timestamp),
    metadata: evt as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber: raw.pro_number ?? undefined,
      carrierId: 'rplust',
      status: 'UNKNOWN',
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
