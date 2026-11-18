import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── Omniva raw types ──────────────────────────────────────────────────────

export interface OmnivaTrackingEvent {
  event_code: string
  description: string | null
  timestamp: string
  location: string | null
  country: string | null
  [key: string]: unknown
}

export interface OmnivaTrackingResponse {
  barcode: string
  status: string | null
  events: OmnivaTrackingEvent[]
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapTrackingStatus(eventCode: string): TrackingEventStatus {
  switch (eventCode) {
    case 'REGISTERED':         return 'PRE_TRANSIT'
    case 'IN_TRANSIT':         return 'IN_TRANSIT'
    case 'IN_DELIVERY':        return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':          return 'DELIVERED'
    case 'IN_PARCEL_MACHINE':  return 'AVAILABLE_FOR_PICKUP'
    case 'RETURNED':           return 'RETURN_TO_SENDER'
    case 'EXCEPTION':          return 'FAILURE'
    default:                   return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformTracking(raw: OmnivaTrackingResponse): TrackingEvent[] {
  const events: TrackingEvent[] = (raw.events ?? []).map((evt) => ({
    trackingNumber: raw.barcode ?? undefined,
    carrierId: 'omniva',
    status: mapTrackingStatus(evt.event_code),
    description: evt.description || undefined,
    location: evt.location
      ? { city: evt.location, country: evt.country ?? undefined }
      : undefined,
    occurredAt: toISODate(evt.timestamp),
    metadata: evt as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber: raw.barcode ?? undefined,
      carrierId: 'omniva',
      status: 'UNKNOWN',
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
