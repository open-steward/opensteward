import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

export interface DoordashDelivery {
  external_delivery_id: string
  delivery_status?: string | null
  tracking_url?: string | null
  updated_at?: string | null
  created_at?: string | null
  [key: string]: unknown
}

function mapStatus(s: string | null | undefined): TrackingEventStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'created':
    case 'quote':              return 'PRE_TRANSIT'
    case 'enroute_to_pickup':
    case 'arrived_at_pickup':
    case 'picked_up':          return 'IN_TRANSIT'
    case 'enroute_to_dropoff':
    case 'arrived_at_dropoff': return 'OUT_FOR_DELIVERY'
    case 'delivered':          return 'DELIVERED'
    case 'returned':           return 'RETURN_TO_SENDER'
    case 'cancelled':
    case 'canceled':           return 'FAILURE'
    default:                   return 'UNKNOWN'
  }
}

export function transformTracking(raw: DoordashDelivery): TrackingEvent[] {
  return [
    {
      shipmentId: raw.external_delivery_id,
      trackingNumber: raw.external_delivery_id,
      carrierId: 'doordash-drive',
      status: mapStatus(raw.delivery_status),
      occurredAt: toISODate(raw.updated_at ?? raw.created_at),
      metadata: raw as Record<string, unknown>,
    },
  ]
}
