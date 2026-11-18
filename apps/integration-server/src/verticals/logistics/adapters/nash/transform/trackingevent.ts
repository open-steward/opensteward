/**
 * Nash individual tracking-event transform.
 *
 * Nash tracks delivery jobs and emits status updates. Each job has a single
 * current status, so a "listing" of tracking events for a job yields one
 * event per job (or more if Nash's webhook history is replayed).
 */
import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

export interface NashJobStatus {
  id?: string | null
  job_id?: string | null
  status?: string | null
  description?: string | null
  occurred_at?: string | null
  created_at?: string | null
  [key: string]: unknown
}

function mapStatus(s: string | null | undefined): TrackingEventStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'created':
    case 'pending':
      return 'PRE_TRANSIT'
    case 'assigned_driver':
    case 'pickup_enroute':
    case 'pickup_arrived':
    case 'pickup_complete':
      return 'IN_TRANSIT'
    case 'dropoff_enroute':
    case 'dropoff_arrived':
      return 'OUT_FOR_DELIVERY'
    case 'dropoff_complete':
    case 'delivered':
      return 'DELIVERED'
    case 'returned':
      return 'RETURN_TO_SENDER'
    case 'canceled_by_provider':
    case 'canceled_by_nash':
    case 'canceled':
    case 'cancelled':
      return 'FAILURE'
    default:
      return 'UNKNOWN'
  }
}

export function transformTrackingEvent(
  raw: NashJobStatus,
  jobId?: string,
): TrackingEvent {
  const id = raw.job_id ?? jobId ?? undefined
  return {
    shipmentId: id,
    trackingNumber: id,
    carrierId: 'nash',
    status: mapStatus(raw.status),
    description: raw.description || undefined,
    occurredAt: toISODate(raw.occurred_at ?? raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
}
