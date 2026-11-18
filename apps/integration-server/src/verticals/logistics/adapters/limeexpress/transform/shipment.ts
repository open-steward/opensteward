import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toWeight, toISODate } from '../../shared/transform'

// --- Lime Express raw types ------------------------------------------------

export interface LimeExpressShipment {
  shipmentId: string
  trackingNumber: string | null
  status: string | null
  label_url: string | null
  service_code: string | null
  weight: number | null
  weight_unit: string | null
  sender: Record<string, unknown> | null
  recipient: Record<string, unknown> | null
  reference: string | null
  created_at: string | null
  updated_at: string | null
  [key: string]: unknown
}

// --- Status mapping --------------------------------------------------------

function mapShipmentStatus(status: string | null): ShipmentStatus {
  switch (status) {
    case 'RECIBIDO':            return 'PENDING'
    case 'EN_TRANSITO':         return 'IN_TRANSIT'
    case 'EN_REPARTO':          return 'OUT_FOR_DELIVERY'
    case 'ENTREGADO':           return 'DELIVERED'
    case 'NO_ENTREGADO':        return 'EXCEPTION'
    case 'DEVUELTO':            return 'RETURNED'
    case 'CANCELADO':           return 'CANCELLED'
    default:                    return 'UNKNOWN'
  }
}

// --- Transform -------------------------------------------------------------

export function transformShipment(raw: LimeExpressShipment): Shipment {
  const weightUnit = (raw.weight_unit?.toLowerCase() ?? 'kg') as 'oz' | 'lb' | 'g' | 'kg'

  return {
    id: raw.shipmentId,
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.trackingNumber ?? undefined,
    carrierId: 'limeexpress',
    serviceCode: raw.service_code ?? undefined,
    originAddress: toAddress(raw.sender),
    destinationAddress: toAddress(raw.recipient),
    totalWeight: raw.weight != null ? toWeight(raw.weight, weightUnit) : undefined,
    labelUrl: raw.label_url ?? undefined,
    reference: raw.reference ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
