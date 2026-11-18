import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── OCA raw types ────────────────────────────────────────────────────────

export interface OcaTrackingEvent {
  estado: string
  descripcion: string | null
  fecha: string
  sucursal: string | null
  ciudad: string | null
  [key: string]: unknown
}

export interface OcaTrackingResponse {
  tracking_number: string
  estado: string | null
  eventos: OcaTrackingEvent[]
  [key: string]: unknown
}

// ─── Status mapping ────────────────────────────────────────────────────────

function mapTrackingStatus(estado: string): TrackingEventStatus {
  switch (estado) {
    case 'IMPUESTO':      return 'PRE_TRANSIT'
    case 'EN_CAMINO':     return 'IN_TRANSIT'
    case 'EN_REPARTO':    return 'OUT_FOR_DELIVERY'
    case 'ENTREGADO':     return 'DELIVERED'
    case 'NO_ENTREGADO':  return 'FAILURE'
    case 'DEVUELTO':      return 'RETURN_TO_SENDER'
    default:              return 'UNKNOWN'
  }
}

// ─── Transform ─────────────────────────────────────────────────────────────

export function transformTracking(raw: OcaTrackingResponse): TrackingEvent[] {
  const events: TrackingEvent[] = (raw.eventos ?? []).map((evt) => ({
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: 'oca',
    status: mapTrackingStatus(evt.estado),
    description: evt.descripcion || undefined,
    location: evt.ciudad
      ? { city: evt.ciudad }
      : undefined,
    occurredAt: toISODate(evt.fecha),
    metadata: evt as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber: raw.tracking_number ?? undefined,
      carrierId: 'oca',
      status: 'UNKNOWN',
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
