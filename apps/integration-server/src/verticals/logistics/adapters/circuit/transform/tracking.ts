import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

export interface CircuitStop {
  id: string
  packageStatus?: string | null  // SUCCEEDED | ATTEMPTED | NOT_DELIVERED
  state?: string | null  // unstarted | enroute | finished
  trackingUrl?: string | null
  externalId?: string | null
  stopFinishedAt?: string | null
  stopStartedAt?: string | null
  [key: string]: unknown
}

function mapStatus(state: string | null | undefined, packageStatus: string | null | undefined): TrackingEventStatus {
  switch ((packageStatus ?? '').toUpperCase()) {
    case 'SUCCEEDED': return 'DELIVERED'
    case 'NOT_DELIVERED':
    case 'ATTEMPTED': return 'FAILURE'
  }
  switch ((state ?? '').toLowerCase()) {
    case 'unstarted': return 'PRE_TRANSIT'
    case 'enroute':   return 'OUT_FOR_DELIVERY'
    case 'finished':  return 'DELIVERED'
    default:          return 'UNKNOWN'
  }
}

export function transformTracking(raw: CircuitStop): TrackingEvent[] {
  return [{
    shipmentId: raw.id,
    trackingNumber: raw.externalId ?? raw.id,
    carrierId: 'circuit',
    status: mapStatus(raw.state, raw.packageStatus),
    occurredAt: toISODate(raw.stopFinishedAt ?? raw.stopStartedAt),
    metadata: raw as Record<string, unknown>,
  }]
}
