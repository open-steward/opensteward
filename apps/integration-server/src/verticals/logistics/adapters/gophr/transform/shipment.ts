import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toISODate } from '../../shared/transform'

export interface GophrShipment {
  job_id: string
  status?: string | null
  pickup_address?: Record<string, unknown> | null
  delivery_address?: Record<string, unknown> | null
  external_id?: string | null
  tracking_link?: string | null
  created_time?: string | null
  updated_time?: string | null
  [key: string]: unknown
}

function mapStatus(s: string | null | undefined): ShipmentStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'created':         return 'LABEL_CREATED'
    case 'accepted':
    case 'collected':       return 'IN_TRANSIT'
    case 'out_for_delivery':return 'OUT_FOR_DELIVERY'
    case 'delivered':       return 'DELIVERED'
    case 'returned':        return 'RETURNED'
    case 'cancelled':
    case 'canceled':        return 'CANCELLED'
    case 'failed':          return 'EXCEPTION'
    default:                return 'UNKNOWN'
  }
}

export function transformShipment(raw: GophrShipment): Shipment {
  return {
    id: raw.job_id,
    status: mapStatus(raw.status),
    trackingNumber: raw.job_id,
    carrierId: 'gophr',
    originAddress: toAddress(raw.pickup_address ?? null),
    destinationAddress: toAddress(raw.delivery_address ?? null),
    labelUrl: raw.tracking_link ?? undefined,
    reference: raw.external_id ?? undefined,
    createdAt: toISODate(raw.created_time),
    updatedAt: toISODate(raw.updated_time),
    metadata: raw as Record<string, unknown>,
  }
}
