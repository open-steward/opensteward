import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'
import type { SenpexOrder, SenpexRoute } from './shipment'

/**
 * Maps the numeric Senpex status to a canonical TrackingEventStatus.
 *
 * Senpex status milestones:
 *   1000 — Ready for delivery
 *   1500 — Scheduled
 *   1550 — Courier assigned
 *   1590 — Arrived at pickup
 *   1630 — Picked up (in transit)
 *   1670 — Arrived at drop-off point
 *   1700 — Delivered
 *     -1 — Cancelled
 */
function mapStatus(status: number | string | null | undefined): TrackingEventStatus {
  const s = status != null ? Number(status) : NaN
  if (isNaN(s)) return 'UNKNOWN'
  if (s === -1) return 'FAILURE'
  if (s < 1500) return 'PRE_TRANSIT'
  if (s < 1630) return 'IN_TRANSIT'
  if (s < 1700) return 'OUT_FOR_DELIVERY'
  if (s === 1700) return 'DELIVERED'
  return 'UNKNOWN'
}

function routeStatusDescription(routeStatus: number | null | undefined): string | undefined {
  switch (routeStatus) {
    case 0: return 'Not taken'
    case 1: return 'Taken by courier'
    case 2: return 'Delivered'
    default: return undefined
  }
}

export function transformTracking(raw: SenpexOrder): TrackingEvent[] {
  const orderId = raw.id != null ? String(raw.id) : undefined
  const events: TrackingEvent[] = []

  // Primary order-level event
  events.push({
    shipmentId: orderId,
    trackingNumber: orderId,
    carrierId: 'senpex',
    status: mapStatus(raw.status),
    occurredAt: toISODate(raw.updated_at ?? raw.created_at),
    metadata: raw as Record<string, unknown>,
  })

  // Per-route events for multi-stop orders
  const routes: SenpexRoute[] = raw.routes ?? []
  for (const route of routes) {
    const routeId = route.id != null ? String(route.id) : undefined
    events.push({
      id: routeId,
      shipmentId: orderId,
      trackingNumber: orderId,
      carrierId: 'senpex',
      status: route.route_status === 2 ? 'DELIVERED' : mapStatus(raw.status),
      description: routeStatusDescription(route.route_status ?? undefined),
      location: route.route_to_text
        ? { street1: route.route_to_text ?? undefined }
        : undefined,
      occurredAt: toISODate(route.delivered_at ?? raw.updated_at),
      metadata: route as Record<string, unknown>,
    })
  }

  return events
}
