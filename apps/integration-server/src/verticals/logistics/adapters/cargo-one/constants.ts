/**
 * cargo.one API constants.
 *
 * cargo.one is an AI-native air and ocean freight platform for forwarders.
 * It provides live rates, bookable capacity, shipment tracking, and booking
 * management via a REST API.
 *
 * Authentication: OAuth 2.0 client_credentials flow.
 *   Token endpoint: https://api.cargo.one/v2/oauth/token
 *   Tokens are short-lived (typically 3600 s); refreshCredentials re-runs
 *   the client_credentials grant using clientId/clientSecret stored in
 *   credentials.extra.
 *
 * Base URL: https://api.cargo.one/v2
 */

export const CARGO_ONE_API_BASE = 'https://api.cargo.one/v2'
export const CARGO_ONE_TOKEN_URL = 'https://api.cargo.one/v2/oauth/token'
export const CARGO_ONE_DASHBOARD_URL = 'https://www.cargo.one/forwarders/solutions/api-tms-integration'

/** Conservative rate-limit default (cargo.one does not publish hard limits). */
export const RATE_LIMIT_RPS = 10

export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100

/** Cargo.one shipment status values → canonical ShipmentStatus. */
export const SHIPMENT_STATUS_MAP: Record<string, string> = {
  draft: 'PENDING',
  booked: 'LABEL_CREATED',
  confirmed: 'LABEL_CREATED',
  in_transit: 'IN_TRANSIT',
  out_for_delivery: 'OUT_FOR_DELIVERY',
  delivered: 'DELIVERED',
  cancelled: 'CANCELLED',
  exception: 'EXCEPTION',
  returned: 'RETURNED',
}

/** Cargo.one tracking event status values → canonical TrackingEventStatus. */
export const TRACKING_STATUS_MAP: Record<string, string> = {
  pre_transit: 'PRE_TRANSIT',
  in_transit: 'IN_TRANSIT',
  out_for_delivery: 'OUT_FOR_DELIVERY',
  delivered: 'DELIVERED',
  available_for_pickup: 'AVAILABLE_FOR_PICKUP',
  return_to_sender: 'RETURN_TO_SENDER',
  failure: 'FAILURE',
  exception: 'FAILURE',
}
