import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate, toWeight, parseDecimal } from '../../shared/transform'
import { transformAddress, type ChazkiAddress } from './address'

/**
 * Chazki shipment/order resource returned by POST /shipments or GET /shipments/:id.
 *
 * The Chazki API refers to these as "shipments" (envíos) or "packages" (paquetes)
 * depending on the endpoint. Fields marked optional may be absent in list vs. detail
 * responses.
 */
export interface ChazkiShipment {
  id?: string | null
  /** Chazki internal order/tracking code (e.g. "CHZ-0000001"). */
  code?: string | null
  tracking_number?: string | null
  tracking_code?: string | null
  reference?: string | null
  /** Status string from Chazki (e.g. "creado", "en_camino", "entregado"). */
  status?: string | null
  service?: string | null
  service_type?: string | null
  carrier?: string | null
  /** Weight in kg. */
  weight?: number | null
  /** Declared value / cost. */
  declared_value?: number | null
  currency?: string | null
  /** Label PDF / ZPL URL. */
  label_url?: string | null
  label?: string | null
  origin?: ChazkiAddress | null
  destination?: ChazkiAddress | null
  sender?: ChazkiAddress | null
  receiver?: ChazkiAddress | null
  notes?: string | null
  created_at?: string | null
  updated_at?: string | null
  estimated_delivery_date?: string | null
  delivered_at?: string | null
  [key: string]: unknown
}

/**
 * Map Chazki status strings onto canonical ShipmentStatus values.
 *
 * Official Chazki lifecycle statuses (from nintendo.yaml):
 *   NEW → PICKUP → GOTO_PICK → ARRIVED_PICK → PICKING → FAILED_PICK →
 *   COLLECTED → GOTO_DELIVER → ARRIVED_DELIVER → DELIVERED →
 *   FAILED_DROP → RETURNED → CANCELED
 *
 * Spanish variants are also included for legacy API responses.
 */
function mapShipmentStatus(status: string | null | undefined): ShipmentStatus {
  switch ((status ?? '').toUpperCase()) {
    // Pre-transit / label created
    case 'NEW':
    case 'CREADO':
    case 'PENDIENTE':
    case 'CREATED':
      return 'PENDING'

    // Label generated, waiting for pickup
    case 'PICKUP':
    case 'GOTO_PICK':
    case 'ARRIVED_PICK':
    case 'GENERADO':
    case 'ETIQUETA_GENERADA':
    case 'LABEL_CREATED':
      return 'LABEL_CREATED'

    // Package collected, in transit
    case 'PICKING':
    case 'COLLECTED':
    case 'GOTO_DELIVER':
    case 'RECOGIDO':
    case 'EN_BODEGA':
    case 'EN_TRANSITO':
    case 'EN_CAMINO':
    case 'IN_TRANSIT':
      return 'IN_TRANSIT'

    // Out for delivery
    case 'ARRIVED_DELIVER':
    case 'EN_REPARTO':
    case 'OUT_FOR_DELIVERY':
      return 'OUT_FOR_DELIVERY'

    // Delivered
    case 'DELIVERED':
    case 'ENTREGADO':
      return 'DELIVERED'

    // Returned to sender
    case 'RETURNED':
    case 'DEVUELTO':
    case 'RETURN_TO_SENDER':
      return 'RETURNED'

    // Cancelled
    case 'CANCELED':
    case 'CANCELLED':
    case 'CANCELADO':
      return 'CANCELLED'

    // Failures / exceptions
    case 'FAILED_PICK':
    case 'FAILED_DROP':
    case 'EXCEPCION':
    case 'EXCEPTION':
    case 'FAILED':
    case 'FALLIDO':
      return 'EXCEPTION'

    default:
      return 'UNKNOWN'
  }
}

export function transformShipment(raw: ChazkiShipment): Shipment {
  const origin = raw.origin ?? raw.sender
  const destination = raw.destination ?? raw.receiver

  return {
    id: raw.id ?? raw.code ?? undefined,
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.tracking_number ?? raw.tracking_code ?? raw.code ?? undefined,
    carrierId: raw.carrier ?? 'chazki',
    serviceCode: raw.service ?? raw.service_type ?? undefined,
    originAddress: origin ? transformAddress(origin) : undefined,
    destinationAddress: destination ? transformAddress(destination) : undefined,
    totalWeight: toWeight(raw.weight, 'kg'),
    labelUrl: raw.label_url ?? raw.label ?? undefined,
    cost: raw.declared_value != null
      ? {
          amount: parseDecimal(raw.declared_value) ?? 0,
          currency: raw.currency ?? 'PEN',
        }
      : undefined,
    reference: raw.reference ?? undefined,
    notes: raw.notes ?? undefined,
    estimatedDeliveryAt: toISODate(raw.estimated_delivery_date),
    actualDeliveryAt: toISODate(raw.delivered_at),
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
