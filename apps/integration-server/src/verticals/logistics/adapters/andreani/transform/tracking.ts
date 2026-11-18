import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── Andreani raw types ────────────────────────────────────────────────────

export interface AndreaniTraza {
  estado: string
  descripcion: string | null
  fecha: string
  sucursal: string | null
  ciudad: string | null
  [key: string]: unknown
}

export interface AndreaniTrackingResponse {
  numero_envio: string
  estado: string | null
  trazas: AndreaniTraza[]
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapTrackingStatus(estado: string): TrackingEventStatus {
  switch (estado) {
    case 'PENDIENTE':         return 'PRE_TRANSIT'
    case 'EN_DISTRIBUCION':   return 'IN_TRANSIT'
    case 'EN_REPARTO':        return 'OUT_FOR_DELIVERY'
    case 'ENTREGADO':         return 'DELIVERED'
    case 'NO_ENTREGADO':      return 'FAILURE'
    case 'DEVUELTO':          return 'RETURN_TO_SENDER'
    default:                  return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformTracking(raw: AndreaniTrackingResponse): TrackingEvent[] {
  const events: TrackingEvent[] = (raw.trazas ?? []).map((traza) => ({
    trackingNumber: raw.numero_envio ?? undefined,
    carrierId: 'andreani',
    status: mapTrackingStatus(traza.estado),
    description: traza.descripcion || undefined,
    location: traza.ciudad
      ? { city: traza.ciudad }
      : undefined,
    occurredAt: toISODate(traza.fecha),
    metadata: traza as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber: raw.numero_envio ?? undefined,
      carrierId: 'andreani',
      status: 'UNKNOWN',
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
