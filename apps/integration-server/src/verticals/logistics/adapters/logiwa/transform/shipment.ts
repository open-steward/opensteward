import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toWeight, toISODate } from '../../shared/transform'

export interface LogiwaShipment {
  ShipmentID: string | number
  TrackingNumber?: string | null
  Status?: string | null
  Carrier?: string | null
  ServiceCode?: string | null
  Weight?: number | null
  WeightUnit?: string | null
  ShipFromAddress?: Record<string, unknown> | null
  ShipToAddress?: Record<string, unknown> | null
  LabelUrl?: string | null
  Reference?: string | null
  CreatedAt?: string | null
  UpdatedAt?: string | null
  [key: string]: unknown
}

function mapStatus(status: string | null | undefined): ShipmentStatus {
  switch (status) {
    case 'Pending':         return 'PENDING'
    case 'LabelCreated':
    case 'Label Created':   return 'LABEL_CREATED'
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

export function transformShipment(raw: LogiwaShipment): Shipment {
  const weightUnit = (raw.WeightUnit?.toLowerCase() ?? 'lb') as 'oz' | 'lb' | 'g' | 'kg'

  return {
    id: String(raw.ShipmentID),
    status: mapStatus(raw.Status),
    trackingNumber: raw.TrackingNumber ?? undefined,
    carrierId: raw.Carrier ?? 'logiwa',
    serviceCode: raw.ServiceCode ?? undefined,
    originAddress: toAddress(raw.ShipFromAddress),
    destinationAddress: toAddress(raw.ShipToAddress),
    totalWeight: raw.Weight != null ? toWeight(raw.Weight, weightUnit) : undefined,
    labelUrl: raw.LabelUrl ?? undefined,
    reference: raw.Reference ?? undefined,
    createdAt: toISODate(raw.CreatedAt),
    updatedAt: toISODate(raw.UpdatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
