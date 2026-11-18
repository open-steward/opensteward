import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toISODate } from '../../shared/transform'

export interface DoordashShipment {
  external_delivery_id: string
  delivery_status?: string | null
  pickup_address?: Record<string, unknown> | null
  dropoff_address?: Record<string, unknown> | null
  tracking_url?: string | null
  order_value?: number | null
  currency?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

function mapStatus(s: string | null | undefined): ShipmentStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'created':
    case 'quote':              return 'LABEL_CREATED'
    case 'enroute_to_pickup':
    case 'picked_up':          return 'IN_TRANSIT'
    case 'enroute_to_dropoff': return 'OUT_FOR_DELIVERY'
    case 'delivered':          return 'DELIVERED'
    case 'returned':           return 'RETURNED'
    case 'cancelled':
    case 'canceled':           return 'CANCELLED'
    default:                   return 'UNKNOWN'
  }
}

export function transformShipment(raw: DoordashShipment): Shipment {
  return {
    id: raw.external_delivery_id,
    status: mapStatus(raw.delivery_status),
    trackingNumber: raw.external_delivery_id,
    carrierId: 'doordash-drive',
    originAddress: toAddress(raw.pickup_address ?? null),
    destinationAddress: toAddress(raw.dropoff_address ?? null),
    labelUrl: raw.tracking_url ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
