import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── Blue Dart raw types ───────────────────────────────────────────────────

export interface BlueDartTrackingEvent {
  status: string
  description: string | null
  timestamp: string
  location: string | null
  center: string | null
  [key: string]: unknown
}

export interface BlueDartTrackingResponse {
  waybill_number: string
  status: string | null
  events: BlueDartTrackingEvent[]
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapTrackingStatus(status: string): TrackingEventStatus {
  switch (status) {
    case 'BOOKED':           return 'PRE_TRANSIT'
    case 'IN_TRANSIT':       return 'IN_TRANSIT'
    case 'OUT_FOR_DELIVERY': return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':        return 'DELIVERED'
    case 'NOT_DELIVERED':    return 'FAILURE'
    case 'RTO':              return 'RETURN_TO_SENDER'
    default:                 return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformTracking(raw: BlueDartTrackingResponse): TrackingEvent[] {
  const events: TrackingEvent[] = (raw.events ?? []).map((evt) => ({
    trackingNumber: raw.waybill_number ?? undefined,
    carrierId: 'bluedart',
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
      trackingNumber: raw.waybill_number ?? undefined,
      carrierId: 'bluedart',
      status: 'UNKNOWN',
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
