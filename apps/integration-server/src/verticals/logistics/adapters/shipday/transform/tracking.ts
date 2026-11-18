import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'
import type { ShipdayOrder } from './order'

function mapStatus(raw: string | null | undefined): TrackingEventStatus {
  if (!raw) return 'UNKNOWN'
  const s = String(raw).toUpperCase()
  if (s === 'ASSIGNED' || s === 'ACCEPTED' || s === 'AWAITING' || s === 'READY_TO_SHIP') return 'PRE_TRANSIT'
  if (s === 'STARTED' || s === 'PICKED_UP' || s === 'IN_TRANSIT') return 'IN_TRANSIT'
  if (s === 'OUT_FOR_DELIVERY') return 'OUT_FOR_DELIVERY'
  if (s === 'DELIVERED') return 'DELIVERED'
  if (s === 'RETURNED') return 'RETURN_TO_SENDER'
  if (s === 'CANCELLED' || s === 'CANCELED' || s === 'FAILED') return 'FAILURE'
  return 'UNKNOWN'
}

/**
 * Shipday does not expose a multi-step tracking event stream via REST.
 * We synthesise a single current-state event from the order's status fields.
 */
export function transformTracking(raw: ShipdayOrder): TrackingEvent[] {
  return [
    {
      shipmentId: raw.orderId != null ? String(raw.orderId) : (raw.orderNumber ?? undefined),
      trackingNumber: raw.orderNumber ?? (raw.orderId != null ? String(raw.orderId) : undefined),
      carrierId: 'shipday',
      status: mapStatus(raw.status),
      description: raw.status ?? undefined,
      occurredAt: toISODate(
        raw.deliveryTime ?? raw.pickupTime ?? raw.updatedAt ?? raw.orderTime ?? raw.createdAt,
      ),
      metadata: raw as Record<string, unknown>,
    },
  ]
}
