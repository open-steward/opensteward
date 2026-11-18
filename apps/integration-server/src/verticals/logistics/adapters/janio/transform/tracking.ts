import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── Janio raw types ────────────────────────────────────────────────────────

export interface JanioTrackingEvent {
  status: string
  description: string | null
  timestamp: string
  location: string | null
  country: string | null
  [key: string]: unknown
}

export interface JanioTrackingResponse {
  tracking_number: string
  status: string | null
  events: JanioTrackingEvent[]
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapTrackingStatus(status: string): TrackingEventStatus {
  switch (status) {
    case 'CREATED':          return 'PRE_TRANSIT'
    case 'PICKED_UP':        return 'PRE_TRANSIT'
    case 'IN_TRANSIT':       return 'IN_TRANSIT'
    case 'CUSTOMS':          return 'IN_TRANSIT'
    case 'OUT_FOR_DELIVERY': return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':        return 'DELIVERED'
    case 'FAILED':           return 'FAILURE'
    case 'RETURNED':         return 'RETURN_TO_SENDER'
    default:                 return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformTracking(raw: JanioTrackingResponse): TrackingEvent[] {
  const events: TrackingEvent[] = (raw.events ?? []).map((evt) => ({
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: 'janio',
    status: mapTrackingStatus(evt.status),
    description: evt.description || undefined,
    location: evt.location || evt.country
      ? {
          city: evt.location ?? undefined,
          country: evt.country ?? undefined,
        }
      : undefined,
    occurredAt: toISODate(evt.timestamp),
    metadata: evt as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber: raw.tracking_number ?? undefined,
      carrierId: 'janio',
      status: 'UNKNOWN',
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
