import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toISODate } from '../../shared/transform'

export interface StuartShipment {
  id: string | number
  status: string | null
  pickup_at?: string | null
  pickups?: Array<{ address?: Record<string, unknown> | null }> | null
  deliveries?: Array<{ address?: Record<string, unknown> | null; tracking_url?: string | null; client_reference?: string | null }> | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

function mapStatus(status: string | null): ShipmentStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'new':
    case 'scheduled':         return 'LABEL_CREATED'
    case 'in_progress':
    case 'picking':           return 'IN_TRANSIT'
    case 'delivering':        return 'OUT_FOR_DELIVERY'
    case 'delivered':
    case 'finished':          return 'DELIVERED'
    case 'canceled':
    case 'cancelled':         return 'CANCELLED'
    case 'voided':
    case 'expired':           return 'EXCEPTION'
    default:                  return 'UNKNOWN'
  }
}

export function transformShipment(raw: StuartShipment): Shipment {
  const dropoff = raw.deliveries?.[0]
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    trackingNumber: String(raw.id),
    carrierId: 'stuart',
    originAddress: toAddress(raw.pickups?.[0]?.address ?? null),
    destinationAddress: toAddress(dropoff?.address ?? null),
    labelUrl: dropoff?.tracking_url ?? undefined,
    reference: dropoff?.client_reference ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
