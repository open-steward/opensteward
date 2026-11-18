import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

export interface OnfleetTask {
  id: string
  state?: number | null  // 0=Unassigned, 1=Assigned, 2=Active, 3=Completed
  completionDetails?: { success?: boolean; time?: number | null } | null
  trackingURL?: string | null
  trackingViewed?: boolean | null
  shortId?: string | null
  timeCreated?: number | null
  timeLastModified?: number | null
  [key: string]: unknown
}

function mapState(state: number | null | undefined, success: boolean | undefined): TrackingEventStatus {
  switch (state) {
    case 0: return 'PRE_TRANSIT'
    case 1: return 'IN_TRANSIT'
    case 2: return 'OUT_FOR_DELIVERY'
    case 3: return success === false ? 'FAILURE' : 'DELIVERED'
    default: return 'UNKNOWN'
  }
}

export function transformTracking(raw: OnfleetTask): TrackingEvent[] {
  return [{
    shipmentId: raw.id,
    trackingNumber: raw.shortId ?? raw.id,
    carrierId: 'onfleet',
    status: mapState(raw.state ?? undefined, raw.completionDetails?.success ?? undefined),
    occurredAt: raw.timeLastModified ? new Date(raw.timeLastModified) : toISODate(raw.timeCreated ?? undefined),
    metadata: raw as Record<string, unknown>,
  }]
}
