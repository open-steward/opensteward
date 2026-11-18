import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

export interface UberDirectDelivery {
  id: string
  status: string | null
  pickup?: { status?: string | null; address?: Record<string, unknown> | null } | null
  dropoff?: { status?: string | null; address?: Record<string, unknown> | null } | null
  tracking_url?: string | null
  updated?: string | null
  created?: string | null
  [key: string]: unknown
}

function mapStatus(status: string | null | undefined): TrackingEventStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'pending':
    case 'created':           return 'PRE_TRANSIT'
    case 'pickup':
    case 'pickup_complete':
    case 'assigned':          return 'IN_TRANSIT'
    case 'dropoff':
    case 'out_for_delivery':  return 'OUT_FOR_DELIVERY'
    case 'delivered':         return 'DELIVERED'
    case 'returned':          return 'RETURN_TO_SENDER'
    case 'canceled':
    case 'cancelled':
    case 'failed':            return 'FAILURE'
    default:                  return 'UNKNOWN'
  }
}

export function transformTracking(raw: UberDirectDelivery): TrackingEvent[] {
  return [
    {
      shipmentId: raw.id,
      trackingNumber: raw.id,
      carrierId: 'uber-direct',
      status: mapStatus(raw.status),
      occurredAt: toISODate(raw.updated ?? raw.created),
      metadata: raw as Record<string, unknown>,
    },
  ]
}
