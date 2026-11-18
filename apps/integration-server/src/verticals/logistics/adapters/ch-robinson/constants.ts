/**
 * C.H. Robinson API constants.
 *
 * Developer portal: https://developer.chrobinson.com/
 * Auth: OAuth 2.0 client_credentials (Duende IdentityServer)
 * Base: https://api.chrobinson.com
 */

export const CHR_API_BASE = 'https://api.chrobinson.com'

/**
 * OAuth 2.0 token endpoint (IdentityServer discovery pattern).
 * Scopes are space-separated; CHR uses audience-scoped identifiers.
 */
export const CHR_TOKEN_URL = 'https://api.chrobinson.com/identity/connect/token'

/** Carrier-facing API uses v1, Navisphere Shipper uses v2 for most resources. */
export const CHR_API_VERSION = 'v2'

/** Developer portal / auth dashboard URL. */
export const CHR_DASHBOARD_URL = 'https://developer.chrobinson.com/'

/**
 * How many milliseconds before expiry to treat a token as expired
 * (pre-emptive refresh to avoid 401 mid-request).
 */
export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000

/** Default page size for list endpoints. */
export const DEFAULT_PAGE_SIZE = 25

/**
 * Map from C.H. Robinson load/shipment status codes → canonical ShipmentStatus.
 * Reference: Navisphere Carrier API — LoadStatus enum.
 */
export const SHIPMENT_STATUS_MAP: Record<string, string> = {
  // Pre-movement
  Available: 'PENDING',
  Pending: 'PENDING',
  Covered: 'LABEL_CREATED',
  Dispatched: 'LABEL_CREATED',
  Accepted: 'LABEL_CREATED',
  // In motion
  AtShipper: 'IN_TRANSIT',
  InTransit: 'IN_TRANSIT',
  Loaded: 'IN_TRANSIT',
  AtReceiver: 'OUT_FOR_DELIVERY',
  // Terminal
  Delivered: 'DELIVERED',
  Completed: 'DELIVERED',
  // Exceptions / voids
  Voided: 'CANCELLED',
  Cancelled: 'CANCELLED',
  Refused: 'EXCEPTION',
  Exception: 'EXCEPTION',
  Returned: 'RETURNED',
}

/**
 * Map from C.H. Robinson tracking event status codes → canonical TrackingEventStatus.
 * Reference: Navisphere Carrier Tracking Events API.
 */
export const TRACKING_STATUS_MAP: Record<string, string> = {
  PickedUp: 'IN_TRANSIT',
  InTransit: 'IN_TRANSIT',
  OutForDelivery: 'OUT_FOR_DELIVERY',
  Delivered: 'DELIVERED',
  AvailableForPickup: 'AVAILABLE_FOR_PICKUP',
  ReturnedToSender: 'RETURN_TO_SENDER',
  Exception: 'FAILURE',
  Undeliverable: 'FAILURE',
  AttemptedDelivery: 'FAILURE',
}

/** C.H. Robinson OAuth2 scopes for carrier & shipper operations. */
export const CHR_SCOPES = [
  'chr-navisphere-carrier',
  'chr-navisphere-shipper',
].join(' ')
