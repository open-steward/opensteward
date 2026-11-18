import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

export interface NashJob {
  id: string
  status?: string | null
  tracking_url?: string | null
  updated_at?: string | null
  created_at?: string | null
  [key: string]: unknown
}

function mapStatus(s: string | null | undefined): TrackingEventStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'created':
    case 'pending':              return 'PRE_TRANSIT'
    case 'assigned_driver':
    case 'pickup_enroute':
    case 'pickup_arrived':
    case 'pickup_complete':      return 'IN_TRANSIT'
    case 'dropoff_enroute':
    case 'dropoff_arrived':      return 'OUT_FOR_DELIVERY'
    case 'dropoff_complete':
    case 'delivered':            return 'DELIVERED'
    case 'returned':             return 'RETURN_TO_SENDER'
    case 'canceled_by_provider':
    case 'canceled_by_nash':
    case 'canceled':
    case 'cancelled':            return 'FAILURE'
    default:                     return 'UNKNOWN'
  }
}

export function transformTracking(raw: NashJob): TrackingEvent[] {
  return [{
    shipmentId: raw.id,
    trackingNumber: raw.id,
    carrierId: 'nash',
    status: mapStatus(raw.status),
    occurredAt: toISODate(raw.updated_at ?? raw.created_at),
    metadata: raw as Record<string, unknown>,
  }]
}
