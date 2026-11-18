import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'

/**
 * One entry of `TrackingEvents`, in both the POST /tracking/trackinginfo
 * response (https://docs.frenet.com.br/reference/trackorder, `TrackingEvent`)
 * and the tracking webhook body
 * (https://docs.frenet.com.br/docs/webhook-atualização-de-tracking).
 */
export interface FrenetTrackingEvent {
  /** "Data e hora do evento (formato: dd/MM/yyyy HH:mm)" — no time zone. */
  EventDateTime?: string | null
  EventDescription?: string | null
  /** "Local da ocorrência", e.g. "Boa Nova-BA". */
  EventLocation?: string | null
  /** "Tipo da ocorrência", a code string such as "9". */
  EventType?: string | number | null
  [key: string]: unknown
}

/**
 * `TrackingResponse` (TrackingNumber, TrackingUrl, ServiceDescrition,
 * ErrorMessage, TrackingEvents), plus the webhook body's `OrderId` and
 * `ShipmentId` ("Identificador único do envio").
 */
export interface FrenetTrackingResponse {
  OrderId?: string | null
  ShipmentId?: number | string | null
  TrackingUrl?: string | null
  TrackingNumber?: string | null
  ServiceDescrition?: string | null
  ErrorMessage?: string | null
  TrackingEvents?: FrenetTrackingEvent[] | null
  [key: string]: unknown
}

/**
 * EventType codes, from the tracking webhook's "Tipos de Eventos" table:
 * 18 "Cliente entregou ao ponto de postagem e está aguardando coleta",
 * 0 "Postado", 1 "Em trânsito", 2 "Atraso", 3 "Objeto Devolvido",
 * 4 "Extravio", 5 "EM ROTA, ... saiu para entrega ao destinatário",
 * 9 "Objeto Entregue".
 */
function mapEventType(code: string | number | null | undefined): TrackingEventStatus {
  if (code === null || code === undefined || String(code).trim() === '') return 'UNKNOWN'
  switch (Number(code)) {
    case 0:
    case 18: // dropped at the posting point, awaiting carrier collection
      return 'PRE_TRANSIT'
    case 1:
    case 2: // delayed, still moving
      return 'IN_TRANSIT'
    case 3:
      return 'RETURN_TO_SENDER'
    case 4:
      return 'FAILURE'
    case 5:
      return 'OUT_FOR_DELIVERY'
    case 9:
      return 'DELIVERED'
    default:
      return 'UNKNOWN'
  }
}

/**
 * "City-UF", the shape of every documented EventLocation ("Boa Nova-BA",
 * "BRASILIA-DF", "Diadema-SP"). Anything else is left in metadata rather than
 * guessed at. The country is not stated, so it is not set.
 */
function parseEventLocation(loc: string | null | undefined): Address | undefined {
  if (typeof loc !== 'string') return undefined
  const m = /^(.+)-([A-Z]{2})$/.exec(loc.trim())
  if (!m) return undefined
  const city = m[1]!.trim()
  return city ? { city, state: m[2] } : undefined
}

/**
 * Canonical events from a tracking response or webhook body. An empty or
 * missing `TrackingEvents` yields no events.
 *
 * `occurredAt` is not set: `EventDateTime` is a wall-clock "dd/MM/yyyy HH:mm"
 * with no documented time zone, so any instant built from it would be a
 * guess. The string stays in `metadata`.
 */
export function transformTrackingResponse(raw: FrenetTrackingResponse): TrackingEvent[] {
  const events = Array.isArray(raw.TrackingEvents) ? raw.TrackingEvents : []
  const trackingNumber =
    typeof raw.TrackingNumber === 'string' && raw.TrackingNumber.trim() !== ''
      ? raw.TrackingNumber.trim()
      : undefined
  const shipmentId =
    raw.ShipmentId !== null && raw.ShipmentId !== undefined && String(raw.ShipmentId).trim() !== ''
      ? String(raw.ShipmentId).trim()
      : undefined

  return events.map((evt): TrackingEvent => ({
    shipmentId,
    trackingNumber,
    status: mapEventType(evt.EventType),
    description:
      typeof evt.EventDescription === 'string' && evt.EventDescription.trim() !== ''
        ? evt.EventDescription.trim()
        : undefined,
    location: parseEventLocation(evt.EventLocation),
    metadata: evt as Record<string, unknown>,
  }))
}
