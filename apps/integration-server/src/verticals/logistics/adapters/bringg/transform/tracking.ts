import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

export interface BringgTask {
  id: number | string
  status?: number | string | null
  external_id?: string | null
  updated_at?: string | null
  created_at?: string | null
  [key: string]: unknown
}

// Bringg statuses: 0=Created, 1=Assigned, 2=OnTheWay, 3=CheckedIn, 4=Done, 5=Late, 6=Accepted, 7=Cancelled, 8=Rejected
function mapStatus(s: number | string | null | undefined): TrackingEventStatus {
  const v = typeof s === 'string' ? s.toLowerCase() : s
  switch (v) {
    case 0: case 'created':   return 'PRE_TRANSIT'
    case 1: case 'assigned':
    case 6: case 'accepted':  return 'IN_TRANSIT'
    case 2: case 'on_the_way':
    case 3: case 'checked_in':return 'OUT_FOR_DELIVERY'
    case 4: case 'done':
    case 'delivered':         return 'DELIVERED'
    case 7: case 'cancelled': case 'canceled':
    case 8: case 'rejected':  return 'FAILURE'
    default:                  return 'UNKNOWN'
  }
}

export function transformTracking(raw: BringgTask): TrackingEvent[] {
  return [{
    shipmentId: String(raw.id),
    trackingNumber: raw.external_id ?? String(raw.id),
    carrierId: 'bringg',
    status: mapStatus(raw.status ?? undefined),
    occurredAt: toISODate(raw.updated_at ?? raw.created_at),
    metadata: raw as Record<string, unknown>,
  }]
}
