export const MOTHERSHIP_API_BASE = 'https://api.mothership.com'
export const MOTHERSHIP_SANDBOX_API_BASE = 'https://sandbox.api.mothership.com'
export const MOTHERSHIP_DASHBOARD_URL = 'https://dashboard.mothership.build/settings/api'

/** All requests go to the /beta path prefix. */
export const MOTHERSHIP_API_VERSION = '/beta'

export const TRACKING_STATUS_MAP: Record<string, string> = {
  // Pre-transit / booked
  booked: 'PRE_TRANSIT',
  pending: 'PRE_TRANSIT',
  scheduled: 'PRE_TRANSIT',
  label_created: 'PRE_TRANSIT',
  // In transit
  in_transit: 'IN_TRANSIT',
  picked_up: 'IN_TRANSIT',
  at_facility: 'IN_TRANSIT',
  out_for_delivery: 'OUT_FOR_DELIVERY',
  // Terminal
  delivered: 'DELIVERED',
  cancelled: 'FAILURE',
  exception: 'FAILURE',
  failed: 'FAILURE',
  returned: 'RETURN_TO_SENDER',
}

export const SHIPMENT_STATUS_MAP: Record<string, string> = {
  booked: 'LABEL_CREATED',
  pending: 'PENDING',
  in_transit: 'IN_TRANSIT',
  out_for_delivery: 'OUT_FOR_DELIVERY',
  delivered: 'DELIVERED',
  cancelled: 'CANCELLED',
  exception: 'EXCEPTION',
  returned: 'RETURNED',
}
