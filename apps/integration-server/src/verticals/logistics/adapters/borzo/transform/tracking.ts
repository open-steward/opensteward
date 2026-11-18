import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { BorzoOrder } from './shipment'

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapTrackingStatus(status: string | null | undefined): TrackingEventStatus {
  switch (status) {
    case 'new':       return 'PRE_TRANSIT'
    case 'available': return 'PRE_TRANSIT'
    case 'active':    return 'IN_TRANSIT'
    case 'delayed':   return 'IN_TRANSIT'
    case 'completed': return 'DELIVERED'
    case 'canceled':  return 'FAILURE'
    default:          return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

/**
 * Borzo does not expose a granular event log on the order endpoint.
 * We synthesise a single tracking event from the current order status.
 */
export function transformTracking(raw: BorzoOrder): TrackingEvent[] {
  const trackingNumber = raw.order_name ?? (raw.order_id != null ? String(raw.order_id) : undefined)
  const status = mapTrackingStatus(raw.status)

  const descriptions: Record<string, string> = {
    new: 'Order created, awaiting confirmation',
    available: 'Order available and offered to couriers',
    active: 'Courier assigned and en route',
    delayed: 'Delivery delayed',
    completed: 'Delivery completed',
    canceled: 'Order cancelled',
  }

  return [
    {
      trackingNumber,
      carrierId: 'borzo',
      status,
      description: raw.status ? (descriptions[raw.status] ?? undefined) : undefined,
      metadata: raw as Record<string, unknown>,
    },
  ]
}
