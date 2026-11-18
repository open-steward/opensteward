import type { PickupStatus } from '../../schema/pickup'

export const UPS_API_BASE = 'https://onlinetools.ups.com'
export const UPS_SANDBOX_API_BASE = 'https://wwwcie.ups.com'

export const UPS_TOKEN_ENDPOINT = '/security/v1/oauth/token'
export const UPS_DASHBOARD_URL = 'https://developer.ups.com'

// API resource paths
export const UPS_RATE_PATH = '/api/rating/v2403/rate'
export const UPS_SHIP_PATH = '/api/shipments/v2409/ship'
export const UPS_TRACK_PATH = '/api/track/v1/details'

// Pickup API. Creation lives under its own /pickupcreation root; cancel shares
// the /shipments root with the Shipping API but is a different service.
// CancelBy 02 = by PRN (carried in the `Prn` header). 01 would cancel every
// pending pickup on the account, so it is deliberately not a constant here.
export const UPS_PICKUP_CREATE_PATH = '/api/pickupcreation/v2409/pickup'
export const UPS_PICKUP_CANCEL_PATH = '/api/shipments/v2409/pickup/02'

// Rate limits: UPS allows 1 request per second for tracking, higher for other endpoints
export const RATE_LIMIT_RPS = 5

// Service code → human-readable name
export const UPS_SERVICE_CODES: Record<string, string> = {
  '01': 'UPS Next Day Air',
  '02': 'UPS 2nd Day Air',
  '03': 'UPS Ground',
  '07': 'UPS Worldwide Express',
  '08': 'UPS Worldwide Expedited',
  '11': 'UPS Standard',
  '12': 'UPS 3 Day Select',
  '13': 'UPS Next Day Air Saver',
  '14': 'UPS Next Day Air Early',
  '54': 'UPS Worldwide Express Plus',
  '65': 'UPS Saver',
}

// UPS tracking status type → canonical status
export const UPS_TRACKING_STATUS_MAP: Record<string, string> = {
  M: 'PRE_TRANSIT',
  I: 'IN_TRANSIT',
  D: 'DELIVERED',
  X: 'FAILURE',
  P: 'IN_TRANSIT',
}

// GWNStatus.Code on a pickup-cancel response → canonical pickup status. UPS only
// returns it for Smart Pickups; an on-call cancel has no status code at all
// (see transform/pickup.ts). 003 = Completed has no canonical equivalent — the
// enum stops at CANCELLED — and 999 is UPS's own "Unknown"; both fall through
// to 'unknown'. 004–007 are driver-attempt outcomes (missed, nobody in, not
// ready, location closed): the pickup did not happen, hence FAILED.
export const UPS_PICKUP_STATUS_MAP: Record<string, PickupStatus> = {
  '001': 'SCHEDULED', // User Triggered
  '002': 'CANCELLED', // User Cancelled
  '004': 'FAILED', // Missed
  '005': 'FAILED', // Not In
  '006': 'FAILED', // Not Ready
  '007': 'FAILED', // Closed
  '008': 'CANCELLED', // Cancelled By Driver
}
