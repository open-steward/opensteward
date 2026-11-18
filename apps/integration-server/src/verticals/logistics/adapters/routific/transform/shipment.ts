import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toISODate } from '../../shared/transform'

export interface RoutificVisitShipment {
  id: string
  status?: string | null
  location?: { address?: string | null; name?: string | null } | null
  duration?: number | null
  custom_notes?: string | null
  arrival_time?: string | null
  finish_time?: string | null
  [key: string]: unknown
}

function mapStatus(s: string | null | undefined): ShipmentStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'pending':
    case 'planned':         return 'LABEL_CREATED'
    case 'in_progress':
    case 'started':         return 'IN_TRANSIT'
    case 'arrived':         return 'OUT_FOR_DELIVERY'
    case 'completed':
    case 'delivered':       return 'DELIVERED'
    case 'failed':          return 'EXCEPTION'
    case 'cancelled':
    case 'canceled':        return 'CANCELLED'
    default:                return 'UNKNOWN'
  }
}

export function transformShipment(raw: RoutificVisitShipment): Shipment {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    trackingNumber: raw.id,
    carrierId: 'routific',
    destinationAddress: raw.location ? toAddress({ street1: raw.location.address, name: raw.location.name }) : undefined,
    notes: raw.custom_notes ?? undefined,
    createdAt: toISODate(raw.arrival_time),
    updatedAt: toISODate(raw.finish_time),
    metadata: raw as Record<string, unknown>,
  }
}
