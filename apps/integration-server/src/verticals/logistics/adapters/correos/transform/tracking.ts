import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'
import { TRACKING_STATUS_MAP } from '../constants'

export interface CorreosTrackingLocation {
  oficina?: string
  localidad?: string
  provincia?: string
  codigoPostal?: string
  pais?: string
  [key: string]: unknown
}

export interface CorreosTrackingEvent {
  fecha: string
  estado: string
  descripcion: string
  ubicacion?: CorreosTrackingLocation
  [key: string]: unknown
}

export interface CorreosTrackingResponse {
  codigoEnvio: string
  estadoActual?: string
  descripcionEstado?: string
  eventos?: CorreosTrackingEvent[]
  [key: string]: unknown
}

function mapTrackingStatus(code: string | undefined): TrackingEventStatus {
  if (!code) return 'UNKNOWN'
  return (TRACKING_STATUS_MAP[code] as TrackingEventStatus) ?? 'UNKNOWN'
}

function toLocation(loc: CorreosTrackingLocation | undefined): Address | undefined {
  if (!loc) return undefined
  const hasAny = loc.localidad || loc.provincia || loc.codigoPostal || loc.pais
  if (!hasAny) return undefined
  return {
    city: loc.localidad ?? undefined,
    state: loc.provincia ?? undefined,
    postalCode: loc.codigoPostal ?? undefined,
    country: loc.pais ?? undefined,
  }
}

export function transformTrackingEvents(raw: CorreosTrackingResponse): TrackingEvent[] {
  const trackingNumber = raw.codigoEnvio

  const events: TrackingEvent[] = (raw.eventos ?? []).map((evt) => ({
    trackingNumber,
    carrierId: 'correos',
    status: mapTrackingStatus(evt.estado),
    description: evt.descripcion ?? undefined,
    location: toLocation(evt.ubicacion),
    occurredAt: toISODate(evt.fecha),
    metadata: raw as Record<string, unknown>,
  }))

  if (events.length === 0) {
    events.push({
      trackingNumber,
      carrierId: 'correos',
      status: mapTrackingStatus(raw.estadoActual),
      description: raw.descripcionEstado ?? undefined,
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
