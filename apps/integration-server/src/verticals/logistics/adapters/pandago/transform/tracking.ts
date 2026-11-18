import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { PandagoOrder } from './shipment'

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapTrackingStatus(status: string | null | undefined): TrackingEventStatus {
  switch (status) {
    case 'NEW':
    case 'RECEIVED':
    case 'WAITING_FOR_TRANSPORT':
      return 'PRE_TRANSIT'
    case 'ASSIGNED_TO_TRANSPORT':
    case 'COURIER_ACCEPTED_DELIVERY':
    case 'NEAR_VENDOR':
    case 'PICKED_UP':
    case 'COURIER_LEFT_VENDOR':
    case 'DELAYED':
      return 'IN_TRANSIT'
    case 'NEAR_CUSTOMER':
      return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':
      return 'DELIVERED'
    case 'CANCELLED':
    case 'RETURNED_TO_VENDOR':
      return 'FAILURE'
    default:
      return 'UNKNOWN'
  }
}

/**
 * pandago timestamps are Unix epoch seconds (integer).
 */
function fromUnixSeconds(val: number | null | undefined): Date | undefined {
  if (val == null) return undefined
  const d = new Date(val * 1000)
  return isNaN(d.getTime()) ? undefined : d
}

// ─── Transform ──────────────────────────────────────────────────────────────

/**
 * pandago's GET /orders/{order_id} returns the current order state but does
 * not expose a structured event history. We synthesise a single TrackingEvent
 * from the current order status. Richer history arrives via webhook callbacks.
 */
export function transformTracking(raw: PandagoOrder): TrackingEvent[] {
  return [
    {
      trackingNumber: raw.order_id ?? undefined,
      carrierId: 'pandago',
      status: mapTrackingStatus(raw.status),
      description: raw.status ?? undefined,
      occurredAt: fromUnixSeconds(raw.updated_at),
      metadata: raw as Record<string, unknown>,
    },
  ]
}
