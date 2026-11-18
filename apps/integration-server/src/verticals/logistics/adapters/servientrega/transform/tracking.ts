import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── Servientrega raw types ───────────────────────────────────────────────

export interface ServientregaTrackingEvent {
  estado: string
  descripcion: string | null
  fecha: string
  sucursal: string | null
  ciudad: string | null
  [key: string]: unknown
}

export interface ServientregaTrackingResponse {
  guia_number: string
  estado: string | null
  eventos: ServientregaTrackingEvent[]
  [key: string]: unknown
}

// ─── Status mapping ────────────────────────────────────────────────────────

function mapTrackingStatus(estado: string): TrackingEventStatus {
  switch (estado) {
    case 'RECOGIDO':          return 'PRE_TRANSIT'
    case 'EN_TRANSITO':       return 'IN_TRANSIT'
    case 'EN_REPARTO':        return 'OUT_FOR_DELIVERY'
    case 'ENTREGADO':         return 'DELIVERED'
    case 'NO_ENTREGADO':      return 'FAILURE'
    case 'DEVUELTO':          return 'RETURN_TO_SENDER'
    default:                  return 'UNKNOWN'
  }
}

// ─── Transform ─────────────────────────────────────────────────────────────

export function transformTracking(raw: ServientregaTrackingResponse): TrackingEvent[] {
  const events: TrackingEvent[] = (raw.eventos ?? []).map((evt) => ({
    trackingNumber: raw.guia_number ?? undefined,
    carrierId: 'servientrega',
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
      trackingNumber: raw.guia_number ?? undefined,
      carrierId: 'servientrega',
      status: 'UNKNOWN',
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
