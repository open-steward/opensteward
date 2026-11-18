import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

export interface GoshareDelivery {
  id: string
  status: string | null
  pickup_address?: Record<string, unknown> | null
  delivery_address?: Record<string, unknown> | null
  tracking_number?: string | null
  driver_name?: string | null
  driver_location?: Record<string, unknown> | null
  estimated_delivery_at?: string | null
  delivered_at?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

function mapStatus(status: string | null | undefined): TrackingEventStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'pending':
    case 'created':
    case 'searching_driver':   return 'PRE_TRANSIT'
    case 'driver_assigned':
    case 'driver_accepted':
    case 'driver_en_route':
    case 'picked_up':
    case 'in_transit':         return 'IN_TRANSIT'
    case 'out_for_delivery':
    case 'arriving_soon':      return 'OUT_FOR_DELIVERY'
    case 'delivered':
    case 'completed':          return 'DELIVERED'
    case 'returned':
    case 'return_to_sender':   return 'RETURN_TO_SENDER'
    case 'cancelled':
    case 'canceled':
    case 'failed':
    case 'undeliverable':      return 'FAILURE'
    default:                   return 'UNKNOWN'
  }
}

export function transformTracking(raw: GoshareDelivery): TrackingEvent[] {
  return [
    {
      shipmentId: raw.id,
      trackingNumber: raw.tracking_number ?? raw.id,
      carrierId: 'goshare',
      status: mapStatus(raw.status),
      occurredAt: toISODate(raw.updated_at ?? raw.created_at),
      metadata: raw as Record<string, unknown>,
    },
  ]
}
