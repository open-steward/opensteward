import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

export interface RoutificVisit {
  id: string
  status?: string | null
  arrival_time?: string | null
  finish_time?: string | null
  location?: { name?: string | null; address?: string | null; lat?: number; lng?: number } | null
  [key: string]: unknown
}

function mapStatus(s: string | null | undefined): TrackingEventStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'pending':
    case 'planned':         return 'PRE_TRANSIT'
    case 'in_progress':
    case 'started':         return 'IN_TRANSIT'
    case 'arrived':         return 'OUT_FOR_DELIVERY'
    case 'completed':
    case 'delivered':       return 'DELIVERED'
    case 'failed':          return 'FAILURE'
    case 'cancelled':
    case 'canceled':        return 'FAILURE'
    default:                return 'UNKNOWN'
  }
}

export function transformTracking(raw: RoutificVisit): TrackingEvent[] {
  return [{
    shipmentId: raw.id,
    trackingNumber: raw.id,
    carrierId: 'routific',
    status: mapStatus(raw.status),
    occurredAt: toISODate(raw.finish_time ?? raw.arrival_time),
    metadata: raw as Record<string, unknown>,
  }]
}
