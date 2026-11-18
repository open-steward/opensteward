import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── YTO Express raw types ─────────────────────────────────────────────────

export interface YtoExpressTrackingEvent {
  status: string
  description: string | null
  timestamp: string
  location: string | null
  [key: string]: unknown
}

export interface YtoExpressTrackingResponse {
  tracking_number: string
  status: string | null
  events: YtoExpressTrackingEvent[]
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapTrackingStatus(status: string): TrackingEventStatus {
  switch (status) {
    case 'GOT':        return 'PRE_TRANSIT'
    case 'DEPARTURE':  return 'IN_TRANSIT'
    case 'ARRIVAL':    return 'IN_TRANSIT'
    case 'DELIVERING': return 'OUT_FOR_DELIVERY'
    case 'SIGNED':     return 'DELIVERED'
    case 'PROBLEM':    return 'FAILURE'
    case 'RETURN':     return 'RETURN_TO_SENDER'
    default:           return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformTracking(raw: YtoExpressTrackingResponse): TrackingEvent[] {
  const events: TrackingEvent[] = (raw.events ?? []).map((evt) => ({
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: 'yto-express',
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
      carrierId: 'yto-express',
      status: 'UNKNOWN',
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
