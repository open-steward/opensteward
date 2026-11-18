import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── Asendia raw types ─────────────────────────────────────────────────────

export interface AsendiaTrackingEvent {
  status: string
  description: string | null
  timestamp: string
  location: string | null
  country: string | null
  [key: string]: unknown
}

export interface AsendiaTrackingResponse {
  tracking_number: string
  status: string | null
  events: AsendiaTrackingEvent[]
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapTrackingStatus(status: string): TrackingEventStatus {
  switch (status) {
    case 'POSTED':             return 'PRE_TRANSIT'
    case 'IN_TRANSIT':         return 'IN_TRANSIT'
    case 'CUSTOMS':            return 'IN_TRANSIT'
    case 'OUT_FOR_DELIVERY':   return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':          return 'DELIVERED'
    case 'RETURNED':           return 'RETURN_TO_SENDER'
    case 'EXCEPTION':          return 'FAILURE'
    default:                   return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformTracking(raw: AsendiaTrackingResponse): TrackingEvent[] {
  const events: TrackingEvent[] = (raw.events ?? []).map((evt) => ({
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: 'asendia',
    status: mapTrackingStatus(evt.status),
    description: evt.description || undefined,
    location: evt.location
      ? { city: evt.location, country: evt.country ?? undefined }
      : undefined,
    occurredAt: toISODate(evt.timestamp),
    metadata: evt as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber: raw.tracking_number ?? undefined,
      carrierId: 'asendia',
      status: 'UNKNOWN',
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
