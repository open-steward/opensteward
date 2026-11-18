import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toWeight, toISODate } from '../../shared/transform'

export interface ShipheroShipment {
  id: string
  legacy_id?: number
  order_id?: string | null
  tracking_number?: string | null
  status?: string | null
  carrier?: string | null
  shipping_method?: string | null
  total_weight?: number | null
  weight_unit?: string | null
  shipping_address?: Record<string, unknown> | null
  warehouse_address?: Record<string, unknown> | null
  label_url?: string | null
  reference?: string | null
  created_at?: string | null
  updated_at?: string | null
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

export function transformShipment(raw: ShipheroShipment): Shipment {
  const weightUnit = (raw.weight_unit?.toLowerCase() ?? 'oz') as 'oz' | 'lb' | 'g' | 'kg'

  return {
    id: raw.id,
    status: mapStatus(raw.status),
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: raw.carrier ?? 'shiphero',
    serviceCode: raw.shipping_method ?? undefined,
    originAddress: toAddress(raw.warehouse_address),
    destinationAddress: toAddress(raw.shipping_address),
    totalWeight: raw.total_weight != null ? toWeight(raw.total_weight, weightUnit) : undefined,
    labelUrl: raw.label_url ?? undefined,
    reference: raw.reference ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
