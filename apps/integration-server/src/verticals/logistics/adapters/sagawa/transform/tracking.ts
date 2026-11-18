import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── Sagawa raw types ──────────────────────────────────────────────────────

export interface SagawaTrackingEvent {
  status_code: string
  status_description: string | null
  timestamp: string
  location: string | null
  depot: string | null
  [key: string]: unknown
}

export interface SagawaTrackingResponse {
  tracking_number: string
  status: string | null
  events: SagawaTrackingEvent[]
  [key: string]: unknown
}

// ─── Status mapping ────────────────────────────────────────────────────────

function mapTrackingStatus(statusCode: string): TrackingEventStatus {
  switch (statusCode) {
    case 'ACCEPTED':          return 'PRE_TRANSIT'
    case 'IN_TRANSIT':        return 'IN_TRANSIT'
    case 'OUT_FOR_DELIVERY':  return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':         return 'DELIVERED'
    case 'HELD':              return 'FAILURE'
    case 'RETURNED':          return 'RETURN_TO_SENDER'
    default:                  return 'UNKNOWN'
  }
}

// ─── Transform ─────────────────────────────────────────────────────────────

export function transformTracking(raw: SagawaTrackingResponse): TrackingEvent[] {
  const events: TrackingEvent[] = (raw.events ?? []).map((evt) => ({
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: 'sagawa',
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
      trackingNumber: raw.tracking_number ?? undefined,
      carrierId: 'sagawa',
      status: 'UNKNOWN',
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
