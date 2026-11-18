export const DESCARTES_API_BASE = 'https://api.descartes.com/'
export const DESCARTES_DASHBOARD_URL = 'https://developer.descartes.com/'
export const RATE_LIMIT_RPS = 10

/**
 * Descartes uses event-code strings for shipment status.
 * Maps to canonical TrackingEventStatus values.
 */
export const TRACKING_STATUS_MAP: Record<string, string> = {
  // Pre-transit
  BOOKED: 'PRE_TRANSIT',
  CREATED: 'PRE_TRANSIT',
  PICKUP_REQUESTED: 'PRE_TRANSIT',
  PICKUP_SCHEDULED: 'PRE_TRANSIT',
  // In transit
  PICKED_UP: 'IN_TRANSIT',
  IN_TRANSIT: 'IN_TRANSIT',
  ARRIVED: 'IN_TRANSIT',
  DEPARTED: 'IN_TRANSIT',
  ON_VEHICLE: 'OUT_FOR_DELIVERY',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  // Delivered
  DELIVERED: 'DELIVERED',
  // Exceptions
  EXCEPTION: 'FAILURE',
  FAILED: 'FAILURE',
  RETURNED: 'RETURN_TO_SENDER',
  RETURN_TO_SENDER: 'RETURN_TO_SENDER',
  AVAILABLE_FOR_PICKUP: 'AVAILABLE_FOR_PICKUP',
}
