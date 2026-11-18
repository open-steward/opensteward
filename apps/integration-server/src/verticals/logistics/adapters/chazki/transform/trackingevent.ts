/**
 * Chazki individual TrackingEvent transform.
 *
 * Re-uses the status mapping from tracking.ts and surfaces a single
 * canonical TrackingEvent per tracking response (or per history entry).
 */
import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'
import type { ChazkiTrackingResponse } from './tracking'

function mapTrackingStatus(status: string | null | undefined): TrackingEventStatus {
  switch ((status ?? '').toUpperCase()) {
    case 'NEW':
    case 'PRE_TRANSITO':
    case 'PRE_TRANSIT':
    case 'CREADO':
    case 'PENDIENTE':
      return 'PRE_TRANSIT'
    case 'PICKUP':
    case 'GOTO_PICK':
    case 'ARRIVED_PICK':
    case 'PICKING':
    case 'COLLECTED':
    case 'GOTO_DELIVER':
    case 'RECOGIDO':
    case 'EN_BODEGA':
    case 'EN_TRANSITO':
    case 'EN_CAMINO':
    case 'IN_TRANSIT':
      return 'IN_TRANSIT'
    case 'ARRIVED_DELIVER':
    case 'EN_REPARTO':
    case 'OUT_FOR_DELIVERY':
      return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':
    case 'ENTREGADO':
      return 'DELIVERED'
    case 'DISPONIBLE_PARA_RECOJO':
    case 'AVAILABLE_FOR_PICKUP':
      return 'AVAILABLE_FOR_PICKUP'
    case 'RETURNED':
    case 'DEVUELTO':
    case 'RETURN_TO_SENDER':
      return 'RETURN_TO_SENDER'
    case 'FAILED_PICK':
    case 'FAILED_DROP':
    case 'EXCEPCION':
    case 'FALLIDO':
    case 'FAILED':
    case 'FAILURE':
    case 'CANCELED':
      return 'FAILURE'
    default:
      return 'UNKNOWN'
  }
}

function toEventLocation(raw: ChazkiTrackingResponse): Address | undefined {
  const city = typeof raw['city'] === 'string' ? raw['city'] : undefined
  const state = typeof raw['state'] === 'string' ? raw['state'] : undefined
  const country = typeof raw['country'] === 'string' ? raw['country'] : undefined
  if (!city && !state && !country) return undefined
  return { city, state, country }
}

export function transformTrackingEvent(raw: ChazkiTrackingResponse): TrackingEvent {
  const trackingNumber =
    (raw.tracking_number ?? raw.tracking_code ?? raw.code ?? raw.delivery_code) ?? undefined
  const topStatus = raw.status ?? raw.delivery_status ?? undefined

  return {
    shipmentId: raw.shipment_id ?? raw.id ?? undefined,
    trackingNumber,
    carrierId: (raw.carrier as string | undefined) ?? 'chazki',
    status: mapTrackingStatus(topStatus),
    location: toEventLocation(raw),
    createdAt: toISODate(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
}
