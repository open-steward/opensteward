/**
 * Shippeo API constants.
 *
 * Shippeo is the leading European supply-chain visibility platform.
 * It exposes a REST API secured with OAuth 2.0 client-credentials flow.
 *
 * Base URL:    https://api.shippeo.com/v1
 * Token URL:   https://auth.shippeo.com/oauth/token
 * Docs:        https://developers.shippeo.com/catalog/all
 */

export const SHIPPEO_API_BASE = 'https://api.shippeo.com/v1'
export const SHIPPEO_TOKEN_URL = 'https://auth.shippeo.com/oauth/token'
export const SHIPPEO_DASHBOARD_URL = 'https://developers.shippeo.com/'

/** Keep-alive buffer: refresh token 5 minutes before expiry. */
export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1_000

/** Conservative request-per-second cap. */
export const RATE_LIMIT_RPS = 10

/**
 * Map Shippeo milestone / status codes to canonical TrackingEventStatus values.
 *
 * Shippeo uses a mix of English-language status strings and milestone codes.
 * Unmapped values fall back to 'UNKNOWN'.
 */
export const TRACKING_STATUS_MAP: Record<string, string> = {
  // Pre-transit
  CREATED: 'PRE_TRANSIT',
  BOOKED: 'PRE_TRANSIT',
  ORDER_CREATED: 'PRE_TRANSIT',
  PICKED_UP: 'PRE_TRANSIT',
  COLLECTION: 'PRE_TRANSIT',
  // In transit
  IN_TRANSIT: 'IN_TRANSIT',
  DEPARTED: 'IN_TRANSIT',
  ARRIVAL: 'IN_TRANSIT',
  CUSTOMS_CLEARED: 'IN_TRANSIT',
  // Out for delivery
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  // Delivered
  DELIVERED: 'DELIVERED',
  DELIVERY_CONFIRMED: 'DELIVERED',
  // Exceptions / failures
  EXCEPTION: 'FAILURE',
  DELAYED: 'FAILURE',
  LOST: 'FAILURE',
  DAMAGED: 'FAILURE',
  RETURNED: 'RETURN_TO_SENDER',
  RETURN_TO_SENDER: 'RETURN_TO_SENDER',
  // Available for pickup (hub / locker)
  AVAILABLE_FOR_PICKUP: 'AVAILABLE_FOR_PICKUP',
  HELD_AT_FACILITY: 'AVAILABLE_FOR_PICKUP',
}

/**
 * Map Shippeo transport mode strings to canonical ShipmentMode values.
 */
export const TRANSPORT_MODE_MAP: Record<string, string> = {
  ROAD: 'ftl',
  AIR: 'air',
  OCEAN: 'ocean',
  SEA: 'ocean',
  RAIL: 'rail',
  PARCEL: 'parcel',
  LTL: 'ltl',
  FTL: 'ftl',
}
