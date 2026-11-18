import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

export interface TookanTask {
  job_id: number | string
  job_status?: number | null
  order_id?: string | null
  job_pickup_datetime?: string | null
  completed_datetime?: string | null
  job_delivery_datetime?: string | null
  [key: string]: unknown
}

// Tookan job_status: 0=Unassigned, 1=Started, 2=Successful, 3=Failed, 4=In Progress, 6=Cancelled, 7=Deleted, 8=Arrived, 9=Accepted, 10=Decline
function mapStatus(s: number | null | undefined): TrackingEventStatus {
  switch (s) {
    case 0: case 9: return 'PRE_TRANSIT'
    case 1: case 4: return 'IN_TRANSIT'
    case 8:         return 'OUT_FOR_DELIVERY'
    case 2:         return 'DELIVERED'
    case 3: case 6: case 7: case 10: return 'FAILURE'
    default:        return 'UNKNOWN'
  }
}

export function transformTracking(raw: TookanTask): TrackingEvent[] {
  return [{
    shipmentId: String(raw.job_id),
    trackingNumber: raw.order_id ?? String(raw.job_id),
    carrierId: 'tookan',
    status: mapStatus(raw.job_status ?? undefined),
    occurredAt: toISODate(raw.completed_datetime ?? raw.job_delivery_datetime ?? raw.job_pickup_datetime),
    metadata: raw as Record<string, unknown>,
  }]
}
