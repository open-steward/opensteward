import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// Locus task/order lifecycle statuses
export interface LocusTask {
  taskId: string
  clientTaskId?: string | null
  status?: string | null
  statusCategory?: string | null
  startEpochMs?: number | null
  endEpochMs?: number | null
  expectedArrivalTime?: string | null
  actualArrivalTime?: string | null
  locationAddress?: {
    addressLine1?: string | null
    addressLine2?: string | null
    city?: string | null
    state?: string | null
    country?: string | null
    pinCode?: string | null
  } | null
  [key: string]: unknown
}

export interface LocusTaskListResponse {
  data?: LocusTask[] | null
  [key: string]: unknown
}

function mapStatus(status: string | null | undefined): TrackingEventStatus {
  if (!status) return 'UNKNOWN'
  const s = status.toUpperCase()
  if (s === 'UNASSIGNED' || s === 'PENDING') return 'PRE_TRANSIT'
  if (s === 'ASSIGNED' || s === 'STARTED' || s === 'PICKUP_COMPLETE') return 'IN_TRANSIT'
  if (s === 'ARRIVED' || s === 'DELIVERY_STARTED') return 'OUT_FOR_DELIVERY'
  if (s === 'DELIVERED' || s === 'COMPLETED') return 'DELIVERED'
  if (s === 'FAILED' || s === 'CANCELLED' || s === 'REJECTED') return 'FAILURE'
  if (s === 'RETURNED') return 'RETURN_TO_SENDER'
  return 'UNKNOWN'
}

export function transformTracking(raw: LocusTask): TrackingEvent {
  const occurredAt = raw.actualArrivalTime
    ? toISODate(raw.actualArrivalTime)
    : raw.endEpochMs
      ? new Date(raw.endEpochMs)
      : raw.startEpochMs
        ? new Date(raw.startEpochMs)
        : undefined

  return {
    shipmentId: raw.taskId,
    trackingNumber: raw.clientTaskId ?? raw.taskId,
    carrierId: 'locus',
    status: mapStatus(raw.status),
    description: raw.statusCategory ?? raw.status ?? undefined,
    occurredAt,
    metadata: raw as Record<string, unknown>,
  }
}

export function transformTrackingList(raw: LocusTaskListResponse): TrackingEvent[] {
  return (raw.data ?? []).map(transformTracking)
}
