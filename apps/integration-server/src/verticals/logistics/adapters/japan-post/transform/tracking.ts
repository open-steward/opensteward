import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── Japan Post raw types ───────────────────────────────────────────────────

export interface JapanPostTrackingEvent {
  status: string
  detail: string | null
  date: string
  time: string | null
  office: string | null
  prefecture: string | null
  country: string | null
  [key: string]: unknown
}

export interface JapanPostTrackingResponse {
  tracking_number: string
  status: string | null
  events: JapanPostTrackingEvent[]
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapTrackingStatus(status: string): TrackingEventStatus {
  switch (status) {
    case 'posting':   return 'PRE_TRANSIT'
    case 'transit':   return 'IN_TRANSIT'
    case 'arrival':   return 'IN_TRANSIT'
    case 'attempt':   return 'FAILURE'
    case 'delivery':  return 'DELIVERED'
    case 'return':    return 'RETURN_TO_SENDER'
    default:          return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformTracking(raw: JapanPostTrackingResponse): TrackingEvent[] {
  const events: TrackingEvent[] = (raw.events ?? []).map((evt) => ({
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: 'japan-post',
    status: mapTrackingStatus(evt.status),
    description: evt.detail || undefined,
    location: evt.office || evt.prefecture
      ? {
          city: evt.office ?? undefined,
          state: evt.prefecture ?? undefined,
          country: evt.country ?? undefined,
        }
      : undefined,
    occurredAt: toISODate(evt.time ? `${evt.date}T${evt.time}` : evt.date),
    metadata: evt as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber: raw.tracking_number ?? undefined,
      carrierId: 'japan-post',
      status: 'UNKNOWN',
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
