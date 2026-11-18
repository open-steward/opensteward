import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

export interface OptimorouteOrder {
  orderNo: string
  status?: string | null  // unscheduled | scheduled | on_route | servicing | success | failed | rejected | cancelled
  date?: string | null
  startTime?: string | null
  endTime?: string | null
  [key: string]: unknown
}

function mapStatus(s: string | null | undefined): TrackingEventStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'unscheduled':
    case 'scheduled':    return 'PRE_TRANSIT'
    case 'on_route':     return 'IN_TRANSIT'
    case 'servicing':    return 'OUT_FOR_DELIVERY'
    case 'success':      return 'DELIVERED'
    case 'failed':
    case 'rejected':
    case 'cancelled':
    case 'canceled':     return 'FAILURE'
    default:             return 'UNKNOWN'
  }
}

export function transformTracking(raw: OptimorouteOrder): TrackingEvent[] {
  return [{
    shipmentId: raw.orderNo,
    trackingNumber: raw.orderNo,
    carrierId: 'optimoroute',
    status: mapStatus(raw.status),
    occurredAt: toISODate(raw.endTime ?? raw.startTime ?? raw.date),
    metadata: raw as Record<string, unknown>,
  }]
}
