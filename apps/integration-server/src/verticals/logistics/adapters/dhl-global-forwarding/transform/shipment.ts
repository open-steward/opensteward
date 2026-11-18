import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toWeight, toISODate } from '../../shared/transform'

export interface DhlGfShipment {
  shipmentId: string
  trackingNumber: string | null
  status: string | null
  serviceCode: string | null
  weight: number | null
  weightUnit: string | null
  sender: Record<string, unknown> | null
  recipient: Record<string, unknown> | null
  reference: string | null
  createdAt: string | null
  updatedAt: string | null
  [key: string]: unknown
}

function mapShipmentStatus(status: string | null): ShipmentStatus {
  const key = (status ?? '').toLowerCase()
  switch (key) {
    case 'created':
    case 'label_created':
    case 'pre-transit':        return 'LABEL_CREATED'
    case 'transit':
    case 'in_transit':         return 'IN_TRANSIT'
    case 'out_for_delivery':   return 'OUT_FOR_DELIVERY'
    case 'delivered':          return 'DELIVERED'
    case 'exception':
    case 'failure':            return 'EXCEPTION'
    case 'returned':
    case 'return_to_sender':   return 'RETURNED'
    case 'cancelled':
    case 'canceled':           return 'CANCELLED'
    default:                   return 'UNKNOWN'
  }
}

export function transformShipment(raw: DhlGfShipment): Shipment {
  const weightUnit = (raw.weightUnit?.toLowerCase() ?? 'kg') as 'oz' | 'lb' | 'g' | 'kg'

  return {
    id: raw.shipmentId,
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.trackingNumber ?? undefined,
    carrierId: 'dhl-global-forwarding',
    serviceCode: raw.serviceCode ?? undefined,
    originAddress: toAddress(raw.sender),
    destinationAddress: toAddress(raw.recipient),
    totalWeight: raw.weight != null ? toWeight(raw.weight, weightUnit) : undefined,
    reference: raw.reference ?? undefined,
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
