/**
 * Transporeon API constants.
 *
 * Carrier API:    https://xch.transporeon.com/carrier_interface/openapi
 * Visibility API: https://api.transporeon.com/rtv
 * Auth:           OAuth 2.0 client_credentials (RFC 6749)
 *
 * Docs: https://transporeon-hcskb.atlassian.net/wiki/spaces/ADPD/overview
 */

/** Carrier interface — transport orders, NTO accept/decline */
export const TRANSPOREON_CARRIER_API_BASE = 'https://xch.transporeon.com/carrier_interface/openapi'

/** Visibility / Real-Time Tracking API */
export const TRANSPOREON_RTV_API_BASE = 'https://api.transporeon.com/rtv'

/**
 * OAuth 2.0 token endpoint.
 * Transporeon does not publish a standalone token URL in their public OpenAPI spec;
 * the client_credentials token endpoint is served at the same host as the carrier API.
 */
export const TRANSPOREON_TOKEN_URL = 'https://xch.transporeon.com/oauth2/token'

/** Transporeon developer / API portal (shown to users instead of an OAuth redirect) */
export const TRANSPOREON_DASHBOARD_URL = 'https://api.transporeon.com'

/** Proactive token refresh: refresh 5 minutes before expiry */
export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000

/** Conservative rate limit for polling — Transporeon recommends 5–30 s between polls */
export const RATE_LIMIT_RPS = 10

/** Default page size when listing transport orders */
export const DEFAULT_PAGE_SIZE = 50

/**
 * Transport status qualifier → canonical ShipmentStatus mapping.
 * Qualifiers come from the `qualifier` field on the top-level transport DTO.
 */
export const TRANSPORT_QUALIFIER_STATUS_MAP: Record<string, string> = {
  'tour.routed': 'PENDING',
  'tour.accepted': 'IN_TRANSIT',
  'tour.assign': 'IN_TRANSIT',
  'tour.assigned.change': 'IN_TRANSIT',
  'tour.assigned.cancelled': 'CANCELLED',
  'tour.tiflow.cancelled': 'CANCELLED',
  'tour.tiflow.modified': 'IN_TRANSIT',
}

/**
 * Visibility event status → canonical TrackingEventStatus mapping.
 * Values are from the Transporeon Visibility API milestone/status codes.
 */
export const VISIBILITY_STATUS_MAP: Record<string, string> = {
  'ARRIVAL': 'IN_TRANSIT',
  'DEPARTURE': 'IN_TRANSIT',
  'LOADING_STARTED': 'IN_TRANSIT',
  'LOADING_COMPLETED': 'IN_TRANSIT',
  'UNLOADING_STARTED': 'OUT_FOR_DELIVERY',
  'UNLOADING_COMPLETED': 'DELIVERED',
  'DELIVERED': 'DELIVERED',
  'DELAY': 'IN_TRANSIT',
  'GPS': 'IN_TRANSIT',
}
