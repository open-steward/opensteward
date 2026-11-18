import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toWeight, toISODate } from '../../shared/transform'

export interface ShipperhqShipment {
  id: string
  orderId?: string | null
  trackingNumber?: string | null
  status?: string | null
  carrierCode?: string | null
  serviceCode?: string | null
  weight?: number | null
  weightUnit?: string | null
  origin?: Record<string, unknown> | null
  destination?: Record<string, unknown> | null
  labelUrl?: string | null
  reference?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

function mapStatus(status: string | null | undefined): ShipmentStatus {
  switch (status) {
    case 'pending':         return 'PENDING'
    case 'label_created':   return 'LABEL_CREATED'
    case 'shipped':
    case 'in_transit':      return 'IN_TRANSIT'
    case 'out_for_delivery': return 'OUT_FOR_DELIVERY'
    case 'delivered':       return 'DELIVERED'
    case 'exception':       return 'EXCEPTION'
    case 'returned':        return 'RETURNED'
    case 'cancelled':       return 'CANCELLED'
    default:                return 'UNKNOWN'
  }
}

export function transformShipment(raw: ShipperhqShipment): Shipment {
  const weightUnit = (raw.weightUnit?.toLowerCase() ?? 'lb') as 'oz' | 'lb' | 'g' | 'kg'

  return {
    id: raw.id,
    status: mapStatus(raw.status),
    trackingNumber: raw.trackingNumber ?? undefined,
    carrierId: raw.carrierCode ?? 'shipperhq',
    serviceCode: raw.serviceCode ?? undefined,
    originAddress: toAddress(raw.origin),
    destinationAddress: toAddress(raw.destination),
    totalWeight: raw.weight != null ? toWeight(raw.weight, weightUnit) : undefined,
    labelUrl: raw.labelUrl ?? undefined,
    reference: raw.reference ?? undefined,
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
