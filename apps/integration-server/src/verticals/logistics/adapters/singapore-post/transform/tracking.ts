import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── Singapore Post raw types ──────────────────────────────────────────────

export interface SingaporePostTrackingEvent {
  status: string
  description: string | null
  timestamp: string
  location: string | null
  [key: string]: unknown
}

export interface SingaporePostTrackingResponse {
  tracking_number: string
  status: string | null
  events: SingaporePostTrackingEvent[]
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapTrackingStatus(status: string): TrackingEventStatus {
  switch (status) {
    case 'POSTED':           return 'PRE_TRANSIT'
    case 'IN_TRANSIT':       return 'IN_TRANSIT'
    case 'OUT_FOR_DELIVERY': return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':        return 'DELIVERED'
    case 'UNSUCCESSFUL':     return 'FAILURE'
    case 'RETURNED':         return 'RETURN_TO_SENDER'
    default:                 return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformTracking(raw: SingaporePostTrackingResponse): TrackingEvent[] {
  const events: TrackingEvent[] = (raw.events ?? []).map((evt) => ({
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: 'singapore-post',
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
      carrierId: 'singapore-post',
      status: 'UNKNOWN',
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
