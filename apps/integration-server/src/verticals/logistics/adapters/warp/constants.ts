export const WARP_API_BASE = 'https://www.wearewarp.com/api/v1'
export const WARP_DASHBOARD_URL = 'https://customer.wearewarp.com'

/**
 * Warp API key format: wak_live_* (production) or wak_test_* (sandbox).
 * The key is passed as a Bearer token in the Authorization header.
 */
export const WARP_AUTH_HEADER = 'Authorization'

export const TRACKING_STATUS_MAP: Record<string, string> = {
  booked: 'PRE_TRANSIT',
  needCarrier: 'PRE_TRANSIT',
  arrivedAtPickup: 'PRE_TRANSIT',
  pickupSuccessful: 'IN_TRANSIT',
  inRouteToWarehouse: 'IN_TRANSIT',
  arrivedAtWarehouse: 'IN_TRANSIT',
  departedFromWarehouse: 'IN_TRANSIT',
  inRouteToDelivery: 'OUT_FOR_DELIVERY',
  delivered: 'DELIVERED',
  exception: 'FAILURE',
  cancelled: 'FAILURE',
}

export const SHIPMENT_STATUS_MAP: Record<string, string> = {
  booked: 'LABEL_CREATED',
  needCarrier: 'PENDING',
  arrivedAtPickup: 'IN_TRANSIT',
  pickupSuccessful: 'IN_TRANSIT',
  inRouteToWarehouse: 'IN_TRANSIT',
  arrivedAtWarehouse: 'IN_TRANSIT',
  departedFromWarehouse: 'IN_TRANSIT',
  inRouteToDelivery: 'IN_TRANSIT',
  delivered: 'DELIVERED',
  exception: 'EXCEPTION',
  cancelled: 'CANCELLED',
}

export const MODE_MAP: Record<string, string> = {
  ltl: 'ltl',
  ftl: 'ftl',
  van: 'ftl',
  box_truck: 'ftl',
}
