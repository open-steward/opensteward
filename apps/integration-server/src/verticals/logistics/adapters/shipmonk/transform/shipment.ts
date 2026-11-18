import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toWeight, toISODate } from '../../shared/transform'

export interface ShipmonkShipment {
  id: string
  order_id?: string | null
  tracking_number?: string | null
  status?: string | null
  carrier?: string | null
  service_code?: string | null
  weight?: number | null
  weight_unit?: string | null
  ship_from?: Record<string, unknown> | null
  ship_to?: Record<string, unknown> | null
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

export function transformShipment(raw: ShipmonkShipment): Shipment {
  const weightUnit = (raw.weight_unit?.toLowerCase() ?? 'lb') as 'oz' | 'lb' | 'g' | 'kg'

  return {
    id: raw.id,
    status: mapStatus(raw.status),
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: raw.carrier ?? 'shipmonk',
    serviceCode: raw.service_code ?? undefined,
    originAddress: toAddress(raw.ship_from),
    destinationAddress: toAddress(raw.ship_to),
    totalWeight: raw.weight != null ? toWeight(raw.weight, weightUnit) : undefined,
    labelUrl: raw.label_url ?? undefined,
    reference: raw.reference ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
