/** Base URL for all Truckstop REST API calls. */
export const TRUCKSTOP_API_BASE = 'https://api-int.truckstop.com'

/** OAuth 2.0 token endpoint path. */
export const TRUCKSTOP_TOKEN_PATH = '/auth/token'

/** Default OAuth scope for Truckstop API access. */
export const TRUCKSTOP_DEFAULT_SCOPE = 'truckstop'

/** Developer portal URL shown to users during OAuth. */
export const TRUCKSTOP_DASHBOARD_URL = 'https://developer.truckstop.com/'

/** Refresh token before it expires to avoid auth failures. */
export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1_000

/** Conservative request rate for the Truckstop API. */
export const RATE_LIMIT_RPS = 10

/** Map Truckstop load status codes to canonical TrackingEventStatus values. */
export const LOAD_STATUS_TRACKING_MAP: Record<string, string> = {
  Available: 'PRE_TRANSIT',
  Covered: 'PRE_TRANSIT',
  Dispatched: 'PRE_TRANSIT',
  'In Transit': 'IN_TRANSIT',
  Delivered: 'DELIVERED',
  Cancelled: 'FAILURE',
  Pending: 'PRE_TRANSIT',
}

/** Map Truckstop load status codes to canonical ShipmentStatus values. */
export const LOAD_STATUS_SHIPMENT_MAP: Record<string, string> = {
  Available: 'PENDING',
  Covered: 'LABEL_CREATED',
  Dispatched: 'LABEL_CREATED',
  'In Transit': 'IN_TRANSIT',
  Delivered: 'DELIVERED',
  Cancelled: 'CANCELLED',
  Pending: 'PENDING',
}
