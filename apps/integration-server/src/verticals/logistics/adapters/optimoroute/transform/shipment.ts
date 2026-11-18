import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toISODate } from '../../shared/transform'

export interface OptimorouteShipment {
  orderNo: string
  status?: string | null
  location?: { address?: string | null; locationName?: string | null; locationNo?: string | null } | null
  type?: string | null
  notes?: string | null
  date?: string | null
  startTime?: string | null
  endTime?: string | null
  [key: string]: unknown
}

function mapStatus(s: string | null | undefined): ShipmentStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'unscheduled':
    case 'scheduled':    return 'LABEL_CREATED'
    case 'on_route':     return 'IN_TRANSIT'
    case 'servicing':    return 'OUT_FOR_DELIVERY'
    case 'success':      return 'DELIVERED'
    case 'failed':
    case 'rejected':     return 'EXCEPTION'
    case 'cancelled':
    case 'canceled':     return 'CANCELLED'
    default:             return 'UNKNOWN'
  }
}

export function transformShipment(raw: OptimorouteShipment): Shipment {
  return {
    id: raw.orderNo,
    status: mapStatus(raw.status),
    trackingNumber: raw.orderNo,
    carrierId: 'optimoroute',
    destinationAddress: raw.location
      ? toAddress({ street1: raw.location.address, name: raw.location.locationName })
      : undefined,
    notes: raw.notes ?? undefined,
    createdAt: toISODate(raw.startTime ?? raw.date),
    updatedAt: toISODate(raw.endTime),
    metadata: raw as Record<string, unknown>,
  }
}
