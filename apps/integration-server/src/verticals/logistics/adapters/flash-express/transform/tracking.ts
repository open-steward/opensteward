import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'

// ─── Flash Express raw types ───────────────────────────────────────────────

/**
 * One entry of `data.routes` from "Tracking order", POST
 * /open/v1/orders/{pno}/routes
 * (https://open-docs.flashexpress.com/#tracking-order-orders-pno-routes):
 * "routes.routedAt | integer | route status timestamp in UTC",
 * "routes.message | string(500) | route status message",
 * "routes.state | integer | route status parcel state". The action is read
 * as `routeAction`, the key both documented response examples use
 * (`"routeAction": "DELIVERY_CONFIRM"`); the table spells it
 * `routes.routedAction`.
 */
export interface FlashExpressRoute {
  routedAt: number
  routeAction: string
  message?: string | null
  state?: number | null
  [key: string]: unknown
}

/** `data` of the routes response: pno, origPno, returnedPno, customaryPno, state, stateText, stateChangeAt, routes. */
export interface FlashExpressRoutesData {
  pno: string
  origPno?: string | null
  returnedPno?: string | null
  customaryPno?: string | null
  state?: number | null
  stateText?: string | null
  stateChangeAt?: number | null
  routes?: FlashExpressRoute[] | null
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

/**
 * Parcel state codes, from the "Web hook status" table
 * (https://open-docs.flashexpress.com/#web-hook-status): "1=Picked up",
 * "2=In transit", "3=On Delivery", "4=Detained", "5=Delivered",
 * "6=Problematic Processing", "7=Returned", "8=Closed", "9=Cancelled".
 */
function mapTrackingStatus(state: number | null | undefined): TrackingEventStatus {
  switch (state) {
    case 1:
    case 2:
      return 'IN_TRANSIT'
    case 3:
      return 'OUT_FOR_DELIVERY'
    case 4:
    case 6:
    case 8:
    case 9:
      return 'FAILURE'
    case 5:
      return 'DELIVERED'
    case 7:
      return 'RETURN_TO_SENDER'
    default:
      return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

/**
 * One event per documented route. `routedAt` is Unix seconds. The event id is
 * built from documented fields (pno, routedAt, routeAction), so it is the same
 * on every read. A parcel with no routes has no events: the parcel-level
 * `state` is a current status, not a history.
 */
export function transformTracking(raw: FlashExpressRoutesData): TrackingEvent[] {
  return (raw.routes ?? []).map((route) => ({
    id: `${raw.pno}:${route.routedAt}:${route.routeAction}`,
    trackingNumber: raw.pno,
    carrierId: 'flash-express',
    status: mapTrackingStatus(route.state),
    description: route.message || undefined,
    occurredAt: new Date(route.routedAt * 1000),
    metadata: route as Record<string, unknown>,
  }))
}
