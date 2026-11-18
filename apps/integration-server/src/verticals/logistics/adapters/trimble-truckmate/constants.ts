/**
 * Trimble TruckMate API constants.
 *
 * TruckMate exposes three separate on-premise (or single-tenant cloud) API services:
 *   /tm        – TruckMate REST API   (license 69000) — orders, trips, tracking
 *   /masterData – Master Data API     (license 69100) — clients, vendors, drivers, sites
 *   /finance    – Finance API         (license 69200) — invoices, payments, GL entries
 *
 * The base URL points to the configured API server host.  In practice each
 * deployment has its own hostname, but Trimble's managed single-tenant
 * hosting uses a consistent path prefix.  We default to the canonical
 * developer-portal host so integration tests and docs stay consistent.
 */
export const TRIMBLE_TRUCKMATE_API_BASE = 'https://api.trimble.com/truckmate'
export const TRIMBLE_TRUCKMATE_TM_PATH = '/tm'
export const TRIMBLE_TRUCKMATE_MASTER_DATA_PATH = '/masterData'

/**
 * TruckMate authentication uses Trimble Identity (TID).
 * The token endpoint is hosted on id.trimble.com, NOT on the TruckMate API
 * host.  Verified via https://id.trimble.com/.well-known/openid-configuration.
 *
 * Grant type: client_credentials (server-to-server).
 * Required scope: openid (as listed in TID OIDC discovery document).
 */
export const TRIMBLE_TRUCKMATE_TOKEN_URL = 'https://id.trimble.com/oauth/token'
export const TRIMBLE_TRUCKMATE_AUTH_SCOPE = 'openid'
export const TRIMBLE_TRUCKMATE_DASHBOARD_URL = 'https://developer.trimble.com/docs/truckmate/'

/** Refresh credentials 5 minutes before expiry. */
export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000

/** Conservative default — TruckMate recommends exponential backoff on 429. */
export const RATE_LIMIT_RPS = 10

// ── Status maps ────────────────────────────────────────────────────────────────

/**
 * TruckMate trip/order statuses → canonical TrackingEventStatus.
 * Statuses are from the TruckMate REST API trip lifecycle.
 */
export const TRACKING_STATUS_MAP: Record<string, string> = {
  // Pre-dispatch
  PLANNED: 'PRE_TRANSIT',
  UNASSIGNED: 'PRE_TRANSIT',
  PENDING: 'PRE_TRANSIT',
  ASSIGNED: 'PRE_TRANSIT',
  DISPATCHED: 'PRE_TRANSIT',
  ACCEPTED: 'PRE_TRANSIT',
  // Active transit
  IN_TRANSIT: 'IN_TRANSIT',
  LOADED: 'IN_TRANSIT',
  AT_STOP: 'IN_TRANSIT',
  DEPARTED: 'IN_TRANSIT',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  // Terminal
  DELIVERED: 'DELIVERED',
  COMPLETED: 'DELIVERED',
  // Failures / exceptions
  CANCELLED: 'FAILURE',
  FAILED: 'FAILURE',
  EXCEPTION: 'FAILURE',
  REFUSED: 'FAILURE',
}

/**
 * TruckMate order statuses → canonical OrderStatus.
 */
export const ORDER_STATUS_MAP: Record<string, string> = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  ON_HOLD: 'ON_HOLD',
  READY: 'AWAITING_SHIPMENT',
  DISPATCHED: 'SHIPPED',
  IN_TRANSIT: 'SHIPPED',
  DELIVERED: 'DELIVERED',
  COMPLETED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
  RETURNED: 'RETURNED',
}

/**
 * TruckMate shipment statuses → canonical ShipmentStatus.
 */
export const SHIPMENT_STATUS_MAP: Record<string, string> = {
  PENDING: 'PENDING',
  PLANNED: 'LABEL_CREATED',
  DISPATCHED: 'IN_TRANSIT',
  IN_TRANSIT: 'IN_TRANSIT',
  AT_STOP: 'IN_TRANSIT',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  EXCEPTION: 'EXCEPTION',
  RETURNED: 'RETURNED',
  CANCELLED: 'CANCELLED',
}
