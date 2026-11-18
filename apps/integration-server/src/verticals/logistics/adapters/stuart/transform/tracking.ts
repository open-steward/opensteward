import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

export interface StuartJob {
  id: string | number
  status: string | null
  tracking_url?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

function mapStatus(status: string | null | undefined): TrackingEventStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'new':
    case 'scheduled':
    case 'searching':         return 'PRE_TRANSIT'
    case 'in_progress':
    case 'almost_picking':
    case 'picking':
    case 'waiting_at_pickup': return 'IN_TRANSIT'
    case 'almost_delivering':
    case 'delivering':
    case 'waiting_at_dropoff':return 'OUT_FOR_DELIVERY'
    case 'delivered':
    case 'finished':          return 'DELIVERED'
    case 'canceled':
    case 'cancelled':
    case 'voided':            return 'FAILURE'
    case 'expired':           return 'FAILURE'
    default:                  return 'UNKNOWN'
  }
}

export function transformTracking(raw: StuartJob): TrackingEvent[] {
  return [
    {
      shipmentId: String(raw.id),
      trackingNumber: String(raw.id),
      carrierId: 'stuart',
      status: mapStatus(raw.status),
      occurredAt: toISODate(raw.updated_at ?? raw.created_at),
      metadata: raw as Record<string, unknown>,
    },
  ]
}
