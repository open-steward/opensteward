import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toISODate } from '../../shared/transform'

export interface UberDirectShipment {
  id: string
  status: string | null
  pickup?: { address?: Record<string, unknown> | null } | null
  dropoff?: { address?: Record<string, unknown> | null } | null
  tracking_url?: string | null
  external_id?: string | null
  created?: string | null
  updated?: string | null
  [key: string]: unknown
}

function mapStatus(status: string | null): ShipmentStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'pending':
    case 'created':           return 'LABEL_CREATED'
    case 'pickup':
    case 'pickup_complete':
    case 'assigned':          return 'IN_TRANSIT'
    case 'dropoff':
    case 'out_for_delivery':  return 'OUT_FOR_DELIVERY'
    case 'delivered':         return 'DELIVERED'
    case 'returned':          return 'RETURNED'
    case 'canceled':
    case 'cancelled':         return 'CANCELLED'
    case 'failed':            return 'EXCEPTION'
    default:                  return 'UNKNOWN'
  }
}

export function transformShipment(raw: UberDirectShipment): Shipment {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    trackingNumber: raw.id,
    carrierId: 'uber-direct',
    originAddress: toAddress(raw.pickup?.address ?? null),
    destinationAddress: toAddress(raw.dropoff?.address ?? null),
    labelUrl: raw.tracking_url ?? undefined,
    reference: raw.external_id ?? undefined,
    createdAt: toISODate(raw.created),
    updatedAt: toISODate(raw.updated),
    metadata: raw as Record<string, unknown>,
  }
}
