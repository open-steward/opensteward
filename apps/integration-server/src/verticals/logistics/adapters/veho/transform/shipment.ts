import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toWeight, toISODate } from '../../shared/transform'

export interface VehoShipment {
  package_id: string
  status?: string | null
  tracking_number?: string | null
  origin_address?: Record<string, unknown> | null
  destination_address?: Record<string, unknown> | null
  weight_oz?: number | null
  reference?: string | null
  label_url?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

function mapStatus(s: string | null | undefined): ShipmentStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'created':         return 'LABEL_CREATED'
    case 'in_transit':      return 'IN_TRANSIT'
    case 'out_for_delivery':return 'OUT_FOR_DELIVERY'
    case 'delivered':       return 'DELIVERED'
    case 'returned':        return 'RETURNED'
    case 'cancelled':
    case 'canceled':        return 'CANCELLED'
    case 'failed':          return 'EXCEPTION'
    default:                return 'UNKNOWN'
  }
}

export function transformShipment(raw: VehoShipment): Shipment {
  return {
    id: raw.package_id,
    status: mapStatus(raw.status),
    trackingNumber: raw.tracking_number ?? raw.package_id,
    carrierId: 'veho',
    originAddress: toAddress(raw.origin_address ?? null),
    destinationAddress: toAddress(raw.destination_address ?? null),
    totalWeight: raw.weight_oz != null ? toWeight(raw.weight_oz, 'oz') : undefined,
    labelUrl: raw.label_url ?? undefined,
    reference: raw.reference ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
