import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── GLS raw types ──────────────────────────────────────────────────────────

export interface GlsTrackingEvent {
  date: string
  time: string
  description: string
  location: string | null
  country: string | null
  code: string
  [key: string]: unknown
}

export interface GlsTracking {
  tuNo: string
  status: string
  history: GlsTrackingEvent[]
  deliveredTo: string | null
  deliveryDate: string | null
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapTrackingStatus(code: string): TrackingEventStatus {
  switch (code) {
    case 'PREADVICE':               return 'PRE_TRANSIT'
    case 'INTRANSIT':               return 'IN_TRANSIT'
    case 'INWAREHOUSE':             return 'IN_TRANSIT'
    case 'INDELIVERY':              return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':               return 'DELIVERED'
    case 'RETURNED':                return 'RETURN_TO_SENDER'
    case 'EXCEPTION':               return 'FAILURE'
    default:                        return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformTracking(
  raw: GlsTracking,
  trackingNumber: string,
): TrackingEvent[] {
  const events: TrackingEvent[] = (raw.history ?? []).map((evt) => ({
    trackingNumber,
    carrierId: 'gls',
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
      carrierId: 'gls',
      status: 'UNKNOWN',
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
