import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toISODate } from '../../shared/transform'

export interface RoadieShipment {
  id: string | number
  state?: string | null
  tracking_number?: string | null
  pickup_location?: { address?: Record<string, unknown> | null } | null
  delivery_location?: { address?: Record<string, unknown> | null } | null
  description?: string | null
  reference_id?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

function mapStatus(s: string | null | undefined): ShipmentStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'new':
    case 'pending':         return 'LABEL_CREATED'
    case 'accepted':
    case 'picked_up':       return 'IN_TRANSIT'
    case 'en_route_delivery': return 'OUT_FOR_DELIVERY'
    case 'delivered':       return 'DELIVERED'
    case 'returned':        return 'RETURNED'
    case 'canceled':
    case 'cancelled':       return 'CANCELLED'
    default:                return 'UNKNOWN'
  }
}

export function transformShipment(raw: RoadieShipment): Shipment {
  return {
    id: String(raw.id),
    status: mapStatus(raw.state),
    trackingNumber: raw.tracking_number ?? String(raw.id),
    carrierId: 'roadie',
    originAddress: toAddress(raw.pickup_location?.address ?? null),
    destinationAddress: toAddress(raw.delivery_location?.address ?? null),
    reference: raw.reference_id ?? undefined,
    notes: raw.description ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
