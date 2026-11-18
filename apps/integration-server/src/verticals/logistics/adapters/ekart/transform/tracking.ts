import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── Ekart raw types ──────────────────────────────────────────────────────

export interface EkartTrackingEvent {
  status_code: string
  status_description: string | null
  timestamp: string
  location: string | null
  hub: string | null
  [key: string]: unknown
}

export interface EkartTrackingResponse {
  awb: string
  status: string | null
  events: EkartTrackingEvent[]
  [key: string]: unknown
}

// ─── Status mapping ────────────────────────────────────────────────────────

function mapTrackingStatus(statusCode: string): TrackingEventStatus {
  switch (statusCode) {
    case 'CREATED':           return 'PRE_TRANSIT'
    case 'DISPATCHED':        return 'IN_TRANSIT'
    case 'OUT_FOR_DELIVERY':  return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':         return 'DELIVERED'
    case 'NOT_DELIVERED':     return 'FAILURE'
    case 'RTO':               return 'RETURN_TO_SENDER'
    default:                  return 'UNKNOWN'
  }
}

// ─── Transform ─────────────────────────────────────────────────────────────

export function transformTracking(raw: EkartTrackingResponse): TrackingEvent[] {
  const events: TrackingEvent[] = (raw.events ?? []).map((evt) => ({
    trackingNumber: raw.awb ?? undefined,
    carrierId: 'ekart',
    status: mapTrackingStatus(evt.status_code),
    description: evt.status_description || undefined,
    location: evt.location
      ? { city: evt.location }
      : undefined,
    occurredAt: toISODate(evt.timestamp),
    metadata: evt as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber: raw.awb ?? undefined,
      carrierId: 'ekart',
      status: 'UNKNOWN',
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
