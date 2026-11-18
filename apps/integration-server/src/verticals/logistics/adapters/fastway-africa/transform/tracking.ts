import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// --- Fastway Africa raw types ----------------------------------------------

export interface FastwayAfricaTrackingEvent {
  status: string
  description: string | null
  timestamp: string
  location: string | null
  [key: string]: unknown
}

export interface FastwayAfricaTracking {
  trackingNumber: string
  currentStatus: string | null
  events: FastwayAfricaTrackingEvent[]
  [key: string]: unknown
}

// --- Status mapping --------------------------------------------------------

function mapTrackingStatus(status: string): TrackingEventStatus {
  switch (status) {
    case 'PICKUP':              return 'PRE_TRANSIT'
    case 'IN_TRANSIT':          return 'IN_TRANSIT'
    case 'OUT_FOR_DELIVERY':    return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':           return 'DELIVERED'
    case 'FAILED':              return 'FAILURE'
    case 'RETURNED':            return 'RETURN_TO_SENDER'
    default:                    return 'UNKNOWN'
  }
}

// --- Transform -------------------------------------------------------------

export function transformTracking(
  raw: FastwayAfricaTracking,
  trackingNumber: string,
): TrackingEvent[] {
  const events: TrackingEvent[] = (raw.events ?? []).map((evt) => ({
    trackingNumber,
    carrierId: 'fastway-africa',
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
      carrierId: 'fastway-africa',
      status: 'UNKNOWN',
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
