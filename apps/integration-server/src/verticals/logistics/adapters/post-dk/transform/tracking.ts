import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── Post Danmark raw types ────────────────────────────────────────────────

export interface PostDkTrackingEvent {
  eventCode: string
  eventDescription: string | null
  eventTime: string
  location: string | null
  country: string | null
  [key: string]: unknown
}

export interface PostDkTrackingResponse {
  shipmentId: string
  status: string | null
  events: PostDkTrackingEvent[]
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapTrackingStatus(eventCode: string): TrackingEventStatus {
  switch (eventCode) {
    case 'HANDED_IN':          return 'PRE_TRANSIT'
    case 'IN_TRANSIT':         return 'IN_TRANSIT'
    case 'OUT_FOR_DELIVERY':   return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':          return 'DELIVERED'
    case 'ATTEMPTED':          return 'FAILURE'
    case 'RETURNED':           return 'RETURN_TO_SENDER'
    case 'READY_FOR_PICKUP':   return 'AVAILABLE_FOR_PICKUP'
    default:                   return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformTracking(raw: PostDkTrackingResponse): TrackingEvent[] {
  const events: TrackingEvent[] = (raw.events ?? []).map((evt) => ({
    trackingNumber: raw.shipmentId ?? undefined,
    carrierId: 'post-dk',
    status: mapTrackingStatus(evt.eventCode),
    description: evt.eventDescription || undefined,
    location: evt.location
      ? { city: evt.location, country: evt.country ?? undefined }
      : undefined,
    occurredAt: toISODate(evt.eventTime),
    metadata: evt as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber: raw.shipmentId ?? undefined,
      carrierId: 'post-dk',
      status: 'UNKNOWN',
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
