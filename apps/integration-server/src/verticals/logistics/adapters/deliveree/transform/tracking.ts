import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'
import type { DelivereeDelivery } from './shipment'

function mapDeliveryStatusToTrackingStatus(
  status: string | null | undefined,
): TrackingEventStatus {
  switch (status) {
    case 'locating_driver':
      return 'PRE_TRANSIT'
    case 'driver_accept_booking':
      return 'PRE_TRANSIT'
    case 'delivery_in_progress':
      return 'IN_TRANSIT'
    case 'delivery_complete':
      return 'DELIVERED'
    case 'canceled':
      return 'RETURN_TO_SENDER'
    case 'locating_driver_timeout':
      return 'FAILURE'
    default:
      return 'UNKNOWN'
  }
}

export function transformDeliveryTracking(raw: DelivereeDelivery): TrackingEvent[] {
  const shipmentId = raw.id != null ? String(raw.id) : undefined

  const event: TrackingEvent = {
    shipmentId,
    carrierId: 'deliveree',
    status: mapDeliveryStatusToTrackingStatus(raw.status),
    description: raw.status ?? undefined,
    occurredAt: toISODate(raw.pickup_time ?? raw.created_at),
    createdAt: toISODate(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }

  return [event]
}
