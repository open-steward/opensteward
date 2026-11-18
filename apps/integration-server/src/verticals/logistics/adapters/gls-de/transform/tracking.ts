import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── GLS-DE raw types ─────────────────────────────────────────────────────

export interface GlsDeTrackingEvent {
  date: string
  time: string
  description: string
  location: string | null
  country: string | null
  code: string
  [key: string]: unknown
}

export interface GlsDeTracking {
  tuNo: string
  status: string
  history: GlsDeTrackingEvent[]
  deliveredTo: string | null
  deliveryDate: string | null
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapTrackingStatus(code: string): TrackingEventStatus {
  switch (code) {
    case 'PREADVICE':    return 'PRE_TRANSIT'
    case 'INTRANSIT':    return 'IN_TRANSIT'
    case 'INDELIVERY':   return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':    return 'DELIVERED'
    case 'RETURNED':     return 'RETURN_TO_SENDER'
    case 'EXCEPTION':    return 'FAILURE'
    case 'PARCELSHOP':   return 'AVAILABLE_FOR_PICKUP'
    default:             return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformTracking(
  raw: GlsDeTracking,
  trackingNumber: string,
): TrackingEvent[] {
  const events: TrackingEvent[] = (raw.history ?? []).map((evt) => ({
    trackingNumber,
    carrierId: 'gls-de',
    status: mapTrackingStatus(evt.code),
    description: evt.description || undefined,
    location: evt.location
      ? { city: evt.location, country: evt.country ?? undefined }
      : undefined,
    occurredAt: toISODate(`${evt.date}T${evt.time}`),
    metadata: raw as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber,
      carrierId: 'gls-de',
      status: 'UNKNOWN',
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
