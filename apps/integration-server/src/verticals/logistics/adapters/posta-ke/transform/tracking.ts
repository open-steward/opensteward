import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// --- Posta Kenya raw types -------------------------------------------------

export interface PostaKeTrackingEvent {
  status: string
  description: string | null
  timestamp: string
  location: string | null
  [key: string]: unknown
}

export interface PostaKeTracking {
  trackingNumber: string
  currentStatus: string | null
  events: PostaKeTrackingEvent[]
  [key: string]: unknown
}

// --- Status mapping --------------------------------------------------------

function mapTrackingStatus(status: string): TrackingEventStatus {
  switch (status) {
    case 'POSTED':              return 'PRE_TRANSIT'
    case 'IN_TRANSIT':          return 'IN_TRANSIT'
    case 'AT_OFFICE':           return 'AVAILABLE_FOR_PICKUP'
    case 'DELIVERED':           return 'DELIVERED'
    case 'RETURNED':            return 'RETURN_TO_SENDER'
    case 'EXCEPTION':           return 'FAILURE'
    default:                    return 'UNKNOWN'
  }
}

// --- Transform -------------------------------------------------------------

export function transformTracking(
  raw: PostaKeTracking,
  trackingNumber: string,
): TrackingEvent[] {
  const events: TrackingEvent[] = (raw.events ?? []).map((evt) => ({
    trackingNumber,
    carrierId: 'posta-ke',
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
      carrierId: 'posta-ke',
      status: 'UNKNOWN',
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
