import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── Freightos raw types ───────────────────────────────────────────────────

export interface FreightosTrackingEvent {
  status: string
  description: string | null
  timestamp: string
  location: string | null
  port: string | null
  [key: string]: unknown
}

export interface FreightosTrackingResponse {
  shipment_id: string
  tracking_number: string | null
  booking_reference: string | null
  status: string | null
  events: FreightosTrackingEvent[]
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapTrackingStatus(status: string): TrackingEventStatus {
  switch (status) {
    case 'BOOKED':             return 'PRE_TRANSIT'
    case 'IN_TRANSIT':         return 'IN_TRANSIT'
    case 'AT_PORT':            return 'IN_TRANSIT'
    case 'CUSTOMS':            return 'IN_TRANSIT'
    case 'DELIVERED':          return 'DELIVERED'
    case 'EXCEPTION':          return 'FAILURE'
    default:                   return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformTracking(raw: FreightosTrackingResponse): TrackingEvent[] {
  const trackingNumber = raw.tracking_number ?? raw.booking_reference ?? undefined

  const events: TrackingEvent[] = (raw.events ?? []).map((evt) => ({
    trackingNumber,
    carrierId: 'freightos',
    status: mapTrackingStatus(evt.status),
    description: evt.description || undefined,
    location: evt.location || evt.port
      ? { city: evt.location ?? evt.port ?? undefined }
      : undefined,
    occurredAt: toISODate(evt.timestamp),
    metadata: evt as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber,
      carrierId: 'freightos',
      status: 'UNKNOWN',
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
