import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toAddress, toISODate } from '../../shared/transform'
import type { WiseSystemsTask } from './shipment'

function mapStatus(
  status: number | null | undefined,
  type: string | null | undefined,
): TrackingEventStatus {
  switch (status) {
    case 0: return 'PRE_TRANSIT'
    case 1: return 'PRE_TRANSIT'
    case 2: return type === 'delivery' ? 'OUT_FOR_DELIVERY' : 'IN_TRANSIT'
    case 3: return 'DELIVERED'
    default: return 'UNKNOWN'
  }
}

export function transformTracking(raw: WiseSystemsTask): TrackingEvent[] {
  const props = raw.props ?? {}
  const completedAt = toISODate(props.completed_at ?? undefined)
  const updatedAt = toISODate(raw.updated_at)
  const createdAt = toISODate(raw.created_at)

  return [
    {
      shipmentId: raw.id,
      trackingNumber: raw.id,
      carrierId: 'wise-systems',
      status: mapStatus(raw.status ?? undefined, raw.type ?? undefined),
      description: raw.type ? `Task type: ${raw.type}` : undefined,
      location: toAddress(raw.location ?? undefined),
      occurredAt: completedAt ?? updatedAt ?? createdAt,
      metadata: raw as Record<string, unknown>,
    },
  ]
}
