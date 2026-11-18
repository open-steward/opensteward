import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toIsoDatetime } from '@opensteward/shared'
import type { TrackPodOrder } from './order'

function mapStatus(raw: string | null | undefined): TrackingEventStatus {
  const s = (raw ?? '').toLowerCase()
  if (s === 'delivered' || s === 'collected') return 'DELIVERED'
  if (s === 'not delivered' || s === 'not collected' || s === 'rejected') return 'FAILURE'
  if (s === 'in progress' || s === 'active' || s === 'partially') return 'OUT_FOR_DELIVERY'
  if (s === 'scheduled') return 'PRE_TRANSIT'
  if (s === 'unscheduled' || s === 'pending') return 'PRE_TRANSIT'
  return 'IN_TRANSIT'
}

export function transformTracking(raw: TrackPodOrder): TrackingEvent[] {
  return [
    {
      shipmentId: raw.Id ?? raw.TrackId ?? undefined,
      trackingNumber: raw.TrackId ?? raw.Number ?? undefined,
      carrierId: 'track-pod',
      status: mapStatus(raw.Status),
      description: raw.Status ?? undefined,
      occurredAt: toIsoDatetime(raw.Date) ? new Date(toIsoDatetime(raw.Date)!) : undefined,
      metadata: raw as Record<string, unknown>,
    },
  ]
}
