import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

/**
 * Glovo tracking response from GET /orders/{orderId}/tracking.
 * Returns the courier's live position plus the current order state.
 */
export interface GlovoTracking {
  orderId?: string | null
  state?: string | null
  courierLat?: number | null
  courierLon?: number | null
  estimatedDeliveryTime?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

function mapTrackingStatus(state: string | null | undefined): TrackingEventStatus {
  switch ((state ?? '').toUpperCase()) {
    case 'SCHEDULED':
    case 'PENDING':
      return 'PRE_TRANSIT'
    case 'ACCEPTED':
    case 'PICKING':
      return 'IN_TRANSIT'
    case 'IN_TRANSIT':
    case 'ON_THE_WAY':
      return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':
      return 'DELIVERED'
    case 'CANCELED':
    case 'CANCELLED':
      return 'FAILURE'
    default:
      return 'UNKNOWN'
  }
}

export function transformTracking(raw: GlovoTracking): TrackingEvent[] {
  return [
    {
      shipmentId: raw.orderId ?? undefined,
      carrierId: 'glovo',
      status: mapTrackingStatus(raw.state),
      location:
        raw.courierLat != null && raw.courierLon != null
          ? { name: `${raw.courierLat},${raw.courierLon}` }
          : undefined,
      occurredAt: toISODate(raw.updatedAt),
      createdAt: toISODate(raw.updatedAt),
      metadata: raw as Record<string, unknown>,
    },
  ]
}
