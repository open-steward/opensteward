import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── Starken raw types ─────────────────────────────────────────────────────

export interface StarkenTrackingEvent {
  status: string
  description: string | null
  timestamp: string
  location: string | null
  [key: string]: unknown
}

export interface StarkenTrackingResponse {
  tracking_number: string
  status: string | null
  events: StarkenTrackingEvent[]
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapTrackingStatus(status: string): TrackingEventStatus {
  switch (status) {
    case 'INGRESADO':     return 'PRE_TRANSIT'
    case 'EN_TRANSITO':   return 'IN_TRANSIT'
    case 'EN_REPARTO':    return 'OUT_FOR_DELIVERY'
    case 'ENTREGADO':     return 'DELIVERED'
    case 'NO_ENTREGADO':  return 'FAILURE'
    case 'DEVUELTO':      return 'RETURN_TO_SENDER'
    default:              return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformTracking(raw: StarkenTrackingResponse): TrackingEvent[] {
  const events: TrackingEvent[] = (raw.events ?? []).map((evt) => ({
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: 'starken',
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
      carrierId: 'starken',
      status: 'UNKNOWN',
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
