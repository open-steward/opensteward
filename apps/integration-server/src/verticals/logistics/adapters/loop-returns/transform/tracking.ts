import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'
import type { LoopReturn } from './return'

/**
 * Map Loop Returns return state to a canonical TrackingEventStatus.
 * Loop Returns models returns as inbound shipments — the state
 * reflects where the parcel is in the reverse-logistics lifecycle.
 */
function mapReturnStateToTrackingStatus(
  state: string | null | undefined,
  labelStatus: string | null | undefined,
): TrackingEventStatus {
  // Label not yet created → pre-transit
  if (!labelStatus || labelStatus === 'pending') return 'PRE_TRANSIT'

  switch (state) {
    case 'open':      return 'IN_TRANSIT'
    case 'closed':    return 'DELIVERED'
    case 'cancelled': return 'FAILURE'
    case 'expired':   return 'FAILURE'
    case 'review':    return 'FAILURE'
    default:          return 'UNKNOWN'
  }
}

/**
 * Transform a Loop Returns return record into one TrackingEvent.
 * Loop Returns does not provide checkpoint-level tracking data via the
 * returns API — each return yields a single summary tracking event.
 */
export function transformReturnToTrackingEvent(raw: LoopReturn): TrackingEvent {
  const status = mapReturnStateToTrackingStatus(raw.state, raw.label_status)

  return {
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: raw.carrier ?? undefined,
    status,
    description: raw.state ?? undefined,
    occurredAt: toISODate(raw.updated_at ?? raw.created_at),
    createdAt: toISODate(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
}
