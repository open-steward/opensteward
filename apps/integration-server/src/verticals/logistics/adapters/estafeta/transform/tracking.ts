import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── Estafeta raw types ────────────────────────────────────────────────────

export interface EstafetaTrackingEvent {
  status_code: string
  description: string | null
  timestamp: string
  location: string | null
  office: string | null
  [key: string]: unknown
}

export interface EstafetaTrackingResponse {
  tracking_number: string
  status: string | null
  events: EstafetaTrackingEvent[]
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapTrackingStatus(statusCode: string): TrackingEventStatus {
  switch (statusCode) {
    case 'DOCUMENTADO':   return 'PRE_TRANSIT'
    case 'EN_RUTA':       return 'IN_TRANSIT'
    case 'EN_REPARTO':    return 'OUT_FOR_DELIVERY'
    case 'ENTREGADO':     return 'DELIVERED'
    case 'NO_ENTREGADO':  return 'FAILURE'
    case 'DEVUELTO':      return 'RETURN_TO_SENDER'
    default:              return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformTracking(raw: EstafetaTrackingResponse): TrackingEvent[] {
  const events: TrackingEvent[] = (raw.events ?? []).map((evt) => ({
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: 'estafeta',
    status: mapTrackingStatus(evt.status_code),
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
      carrierId: 'estafeta',
      status: 'UNKNOWN',
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
