import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toISODate } from '../../shared/transform'

export interface NashShipment {
  id: string
  status?: string | null
  pickup_address?: Record<string, unknown> | null
  dropoff_address?: Record<string, unknown> | null
  tracking_url?: string | null
  external_id?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

function mapStatus(s: string | null | undefined): ShipmentStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'created':
    case 'pending':            return 'LABEL_CREATED'
    case 'assigned_driver':
    case 'pickup_complete':    return 'IN_TRANSIT'
    case 'dropoff_enroute':    return 'OUT_FOR_DELIVERY'
    case 'dropoff_complete':
    case 'delivered':          return 'DELIVERED'
    case 'returned':           return 'RETURNED'
    case 'canceled':
    case 'cancelled':          return 'CANCELLED'
    default:                   return 'UNKNOWN'
  }
}

export function transformShipment(raw: NashShipment): Shipment {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    trackingNumber: raw.id,
    carrierId: 'nash',
    originAddress: toAddress(raw.pickup_address ?? null),
    destinationAddress: toAddress(raw.dropoff_address ?? null),
    labelUrl: raw.tracking_url ?? undefined,
    reference: raw.external_id ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
