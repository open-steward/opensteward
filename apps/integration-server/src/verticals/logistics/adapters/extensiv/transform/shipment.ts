import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toWeight, toISODate } from '../../shared/transform'

export interface ExtensivShipment {
  shipmentId: string | number
  orderId?: string | number
  trackingNumber?: string | null
  status?: string | null
  carrier?: string | null
  serviceCode?: string | null
  weight?: number | null
  weightUnit?: string | null
  shipFromAddress?: Record<string, unknown> | null
  shipToAddress?: Record<string, unknown> | null
  labelUrl?: string | null
  reference?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

function mapStatus(status: string | null | undefined): ShipmentStatus {
  switch (status) {
    case 'Created':
    case 'Pending':         return 'PENDING'
    case 'Label Created':
    case 'LabelCreated':    return 'LABEL_CREATED'
    case 'Shipped':
    case 'In Transit':      return 'IN_TRANSIT'
    case 'Out for Delivery': return 'OUT_FOR_DELIVERY'
    case 'Delivered':       return 'DELIVERED'
    case 'Exception':       return 'EXCEPTION'
    case 'Returned':        return 'RETURNED'
    case 'Cancelled':       return 'CANCELLED'
    default:                return 'UNKNOWN'
  }
}

export function transformShipment(raw: ExtensivShipment): Shipment {
  const weightUnit = (raw.weightUnit?.toLowerCase() ?? 'lb') as 'oz' | 'lb' | 'g' | 'kg'

  return {
    id: String(raw.shipmentId),
    status: mapStatus(raw.status),
    trackingNumber: raw.trackingNumber ?? undefined,
    carrierId: raw.carrier ?? 'extensiv',
    serviceCode: raw.serviceCode ?? undefined,
    originAddress: toAddress(raw.shipFromAddress),
    destinationAddress: toAddress(raw.shipToAddress),
    totalWeight: raw.weight != null ? toWeight(raw.weight, weightUnit) : undefined,
    labelUrl: raw.labelUrl ?? undefined,
    reference: raw.reference ?? undefined,
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
