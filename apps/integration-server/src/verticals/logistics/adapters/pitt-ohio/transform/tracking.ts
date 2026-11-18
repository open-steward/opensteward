import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── PITT OHIO raw types ─────────────────────────────────────────────────

export interface PittOhioTrackingEvent {
  status_code: string
  description: string | null
  timestamp: string
  terminal: string | null
  city: string | null
  state: string | null
  [key: string]: unknown
}

export interface PittOhioTrackingResponse {
  pro_number: string
  status: string | null
  events: PittOhioTrackingEvent[]
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapTrackingStatus(statusCode: string): TrackingEventStatus {
  switch (statusCode) {
    case 'P': return 'PRE_TRANSIT'
    case 'I': return 'IN_TRANSIT'
    case 'O': return 'OUT_FOR_DELIVERY'
    case 'D': return 'DELIVERED'
    case 'X': return 'FAILURE'
    case 'A': return 'IN_TRANSIT'
    default:  return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformTracking(raw: PittOhioTrackingResponse): TrackingEvent[] {
  const events: TrackingEvent[] = (raw.events ?? []).map((evt) => ({
    trackingNumber: raw.pro_number ?? undefined,
    carrierId: 'pitt-ohio',
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
      carrierId: 'pitt-ohio',
      status: 'UNKNOWN',
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
