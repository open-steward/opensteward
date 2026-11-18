import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'

// ─── Raw API types ───────────────────────────────────────────────────────────

export interface TotalExpressTrackingEvent {
  id?: string | number
  shipment_id?: string
  tracking_number?: string
  codigo_rastreio?: string
  status?: string
  descricao?: string
  description?: string
  local?: string
  city?: string
  state?: string
  country?: string
  data_ocorrencia?: string
  timestamp?: string
  [key: string]: unknown
}

export interface TotalExpressShipment {
  id?: string | number
  numero_objeto?: string
  tracking_number?: string
  status?: string
  eventos?: TotalExpressTrackingEvent[]
  events?: TotalExpressTrackingEvent[]
  data_criacao?: string
  data_atualizacao?: string
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

// ─── Status mapping ──────────────────────────────────────────────────────────

function mapTrackingStatus(status: string | null | undefined): TrackingEventStatus {
  switch ((status ?? '').toUpperCase()) {
    case 'CRIADO':
    case 'PENDENTE':
    case 'AGUARDANDO_COLETA':
    case 'CREATED':
    case 'PENDING':
      return 'PRE_TRANSIT'
    case 'COLETADO':
    case 'EM_TRANSITO':
    case 'PICKED_UP':
    case 'IN_TRANSIT':
    case 'TRANSIT':
      return 'IN_TRANSIT'
    case 'SAIU_PARA_ENTREGA':
    case 'OUT_FOR_DELIVERY':
      return 'OUT_FOR_DELIVERY'
    case 'ENTREGUE':
    case 'DELIVERED':
      return 'DELIVERED'
    case 'DISPONIVEL_PARA_RETIRADA':
    case 'AVAILABLE_FOR_PICKUP':
      return 'AVAILABLE_FOR_PICKUP'
    case 'DEVOLVIDO':
    case 'EM_DEVOLUCAO':
    case 'RETURNED':
    case 'RETURN_TO_SENDER':
      return 'RETURN_TO_SENDER'
    case 'FALHOU':
    case 'NAO_ENTREGUE':
    case 'CANCELADO':
    case 'FAILED':
    case 'UNDELIVERED':
    case 'CANCELLED':
      return 'FAILURE'
    default:
      return 'UNKNOWN'
  }
}

// ─── Transform ───────────────────────────────────────────────────────────────

export function transformTrackingEvent(
  raw: TotalExpressTrackingEvent,
  shipmentId?: string,
  trackingNumber?: string,
): TrackingEvent {
  const ts = raw.data_ocorrencia ?? raw.timestamp
  return {
    id: raw.id != null ? String(raw.id) : undefined,
    shipmentId: raw.shipment_id ?? shipmentId,
    trackingNumber: raw.codigo_rastreio ?? raw.tracking_number ?? trackingNumber,
    carrierId: 'total-express',
    status: mapTrackingStatus(raw.status),
    description: raw.descricao ?? raw.description,
    location:
      raw.city || raw.state
        ? {
            city: raw.city,
            state: raw.state,
            country: (raw.country as string | undefined) ?? 'BR',
          }
        : raw.local
          ? { street1: raw.local }
          : undefined,
    occurredAt: ts ? new Date(ts) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

/**
 * Transform a Total Express shipment into an array of tracking events.
 * If the shipment contains an eventos/events array, each entry is transformed.
 * Otherwise a single synthetic event is derived from the shipment's current status.
 */
export function transformTracking(raw: TotalExpressShipment): TrackingEvent[] {
  const shipmentId = raw.id != null ? String(raw.id) : undefined
  const trackingNumber = raw.numero_objeto ?? raw.tracking_number

  const eventList = raw.eventos ?? raw.events
  if (Array.isArray(eventList) && eventList.length > 0) {
    return eventList.map((ev) => transformTrackingEvent(ev, shipmentId, trackingNumber))
  }

  const ts = raw.data_atualizacao ?? raw.updated_at ?? raw.data_criacao ?? raw.created_at
  return [
    {
      shipmentId,
      trackingNumber,
      carrierId: 'total-express',
      status: mapTrackingStatus(raw.status),
      occurredAt: ts ? new Date(ts) : undefined,
      metadata: raw as Record<string, unknown>,
    },
  ]
}
