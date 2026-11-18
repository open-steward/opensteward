export const KOBO360_API_BASE = 'https://api.kobo360.com/v1'
export const KOBO360_DASHBOARD_URL = 'https://app.kobo360.com'

export const RATE_LIMIT_RPS = 20

/**
 * Map Kobo360 trip/shipment status codes to canonical TrackingEventStatus values.
 * Kobo360 is a Pan-African truck-freight marketplace, so statuses reflect
 * trip lifecycle events across road-freight.
 */
export const TRACKING_STATUS_MAP: Record<string, string> = {
  // Pre-transit
  PENDING: 'PRE_TRANSIT',
  ACCEPTED: 'PRE_TRANSIT',
  ASSIGNED: 'PRE_TRANSIT',
  SCHEDULED: 'PRE_TRANSIT',
  // In transit
  LOADING: 'IN_TRANSIT',
  IN_TRANSIT: 'IN_TRANSIT',
  EN_ROUTE: 'IN_TRANSIT',
  AT_BORDER: 'IN_TRANSIT',
  OFFLOADING: 'OUT_FOR_DELIVERY',
  // Delivered
  DELIVERED: 'DELIVERED',
  COMPLETED: 'DELIVERED',
  // Cancelled / failure
  CANCELLED: 'FAILURE',
  FAILED: 'FAILURE',
  INCIDENT: 'FAILURE',
}

/**
 * Map Kobo360 trip status to canonical ShipmentStatus.
 */
export const SHIPMENT_STATUS_MAP: Record<string, string> = {
  PENDING: 'PENDING',
  ACCEPTED: 'PENDING',
  ASSIGNED: 'LABEL_CREATED',
  SCHEDULED: 'LABEL_CREATED',
  LOADING: 'IN_TRANSIT',
  IN_TRANSIT: 'IN_TRANSIT',
  EN_ROUTE: 'IN_TRANSIT',
  AT_BORDER: 'IN_TRANSIT',
  OFFLOADING: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  COMPLETED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
  FAILED: 'EXCEPTION',
  INCIDENT: 'EXCEPTION',
}
