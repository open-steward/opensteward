import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── Naqel raw types ───────────────────────────────────────────────────────

export interface NaqelTrackingEvent {
  status: string
  description: string | null
  timestamp: string
  location: string | null
  [key: string]: unknown
}

export interface NaqelTracking {
  waybillNumber: string
  currentStatus: string | null
  events: NaqelTrackingEvent[]
  [key: string]: unknown
}

// ─── Status mapping ────────────────────────────────────────────────────────

function mapTrackingStatus(status: string): TrackingEventStatus {
  switch (status) {
    case 'BOOKED':              return 'PRE_TRANSIT'
    case 'PICKED_UP':           return 'PRE_TRANSIT'
    case 'IN_TRANSIT':          return 'IN_TRANSIT'
    case 'OUT_FOR_DELIVERY':    return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':           return 'DELIVERED'
    case 'FAILED_ATTEMPT':      return 'FAILURE'
    case 'RETURNED':            return 'RETURN_TO_SENDER'
    default:                    return 'UNKNOWN'
  }
}

// ─── Transform ─────────────────────────────────────────────────────────────

export function transformTracking(
  raw: NaqelTracking,
  trackingNumber: string,
): TrackingEvent[] {
  const events: TrackingEvent[] = (raw.events ?? []).map((evt) => ({
    trackingNumber,
    carrierId: 'naqel',
    status: mapTrackingStatus(evt.status),
    description: evt.description || undefined,
    location: evt.location
      ? { city: evt.location }
      : undefined,
    occurredAt: toISODate(evt.timestamp),
    metadata: raw as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber,
      carrierId: 'naqel',
      status: 'UNKNOWN',
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
