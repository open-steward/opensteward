import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toISODate } from '../../shared/transform'

export interface BringgShipment {
  id: number | string
  status?: number | string | null
  external_id?: string | null
  way_points?: Array<{ address?: string | null; lat?: number; lng?: number; customer_name?: string | null; phone?: string | null }> | null
  customer?: { name?: string | null; phone?: string | null } | null
  title?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

function mapStatus(s: number | string | null | undefined): ShipmentStatus {
  const v = typeof s === 'string' ? s.toLowerCase() : s
  switch (v) {
    case 0: case 'created':    return 'LABEL_CREATED'
    case 1: case 'assigned':
    case 6: case 'accepted':   return 'IN_TRANSIT'
    case 2: case 'on_the_way': return 'OUT_FOR_DELIVERY'
    case 4: case 'done':       return 'DELIVERED'
    case 7: case 'cancelled':
    case 'canceled':           return 'CANCELLED'
    case 8: case 'rejected':   return 'EXCEPTION'
    default:                   return 'UNKNOWN'
  }
}

export function transformShipment(raw: BringgShipment): Shipment {
  const wps = raw.way_points ?? []
  const pickup = wps[0]
  const dropoff = wps[wps.length - 1]
  const toWp = (wp: typeof pickup) => wp ? toAddress({ street1: wp.address, name: wp.customer_name, phone: wp.phone }) : undefined

  return {
    id: String(raw.id),
    status: mapStatus(raw.status ?? undefined),
    trackingNumber: raw.external_id ?? String(raw.id),
    carrierId: 'bringg',
    originAddress: pickup && wps.length > 1 ? toWp(pickup) : undefined,
    destinationAddress: dropoff ? toWp(dropoff) : undefined,
    notes: raw.title ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
