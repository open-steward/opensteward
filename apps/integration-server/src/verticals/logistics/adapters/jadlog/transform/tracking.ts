import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'

/**
 * Individual tracking event from Jadlog's /tracking/consultar response.
 */
export interface JadlogTrackingDetail {
  descricao?: string | null
  status?: string | null
  dataHora?: string | null
  unidade?: string | null
  cidade?: string | null
  uf?: string | null
  ocorrencia?: string | null
  [key: string]: unknown
}

/**
 * Root tracking response from POST /embarcador/api/tracking/consultar.
 *
 * Jadlog can be queried by `codigo`, `shipmentId`, `cte`, `nrpedido`,
 * or `nf` (nota fiscal). The response wraps event history in `tracking`.
 */
export interface JadlogTrackingResponse {
  codigo?: string | null
  cte?: string | null
  shipmentId?: string | null
  nrpedido?: string | null
  status?: string | null
  tracking?: JadlogTrackingDetail[]
  [key: string]: unknown
}

function mapTrackingStatus(status: string | null | undefined): TrackingEventStatus {
  switch ((status ?? '').toUpperCase()) {
    case 'PE':
    case 'CR':
      return 'PRE_TRANSIT'
    case 'EM':
    case 'TR':
      return 'IN_TRANSIT'
    case 'SA':
      return 'OUT_FOR_DELIVERY'
    case 'EN':
      return 'DELIVERED'
    case 'DV':
      return 'RETURN_TO_SENDER'
    case 'AG':  // Aguardando Retirada
      return 'AVAILABLE_FOR_PICKUP'
    case 'EX':
    case 'DE':
      return 'FAILURE'
    default:
      return 'UNKNOWN'
  }
}

function buildLocation(detail: JadlogTrackingDetail): Address | undefined {
  const hasLocation = detail.cidade || detail.uf || detail.unidade
  if (!hasLocation) return undefined
  return {
    city: detail.cidade ?? undefined,
    state: detail.uf ?? undefined,
    country: 'BR',
  }
}

export function transformTracking(raw: JadlogTrackingResponse): TrackingEvent[] {
  const trackingNumber = raw.codigo ?? raw.cte ?? raw.nrpedido ?? undefined
  const shipmentId = raw.shipmentId ?? undefined

  const details = raw.tracking ?? []

  if (details.length === 0) {
    return [
      {
        shipmentId,
        trackingNumber,
        carrierId: 'jadlog',
        status: mapTrackingStatus(raw.status),
        metadata: raw as Record<string, unknown>,
      },
    ]
  }

  return details.map(
    (detail): TrackingEvent => ({
      shipmentId,
      trackingNumber,
      carrierId: 'jadlog',
      status: mapTrackingStatus(detail.status ?? raw.status),
      description: detail.descricao ?? detail.ocorrencia ?? undefined,
      location: buildLocation(detail),
      occurredAt: toISODate(detail.dataHora),
      metadata: raw as Record<string, unknown>,
    }),
  )
}
