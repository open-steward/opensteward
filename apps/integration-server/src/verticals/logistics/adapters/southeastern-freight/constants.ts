/**
 * Southeastern Freight Lines (SEFL) – adapter constants.
 *
 * Auth: HTTP Basic (MySEFL username:password + shipper_account header).
 *
 * Key API surfaces used:
 *   Pickup   POST https://www.sefl.com/pickup-web/api/pickup
 *   Tracking GET  https://www.sefl.com/webconnect/tracing
 *   Rate     POST https://www.sefl.com/webconnect/ratequotes/rest/submitQuote
 *   GetPro   GET  https://www.sefl.com/seflWebsite/resources/generatePro/PreAssigned
 */

export const SEFL_PICKUP_BASE = 'https://www.sefl.com/pickup-web/api'
export const SEFL_WEBCONNECT_BASE = 'https://www.sefl.com/webconnect'
export const SEFL_RESOURCES_BASE = 'https://www.sefl.com/seflWebsite/resources'
export const SEFL_DOC_RETRIEVAL_BASE = 'https://www.sefl.com'

export const SEFL_PICKUP_PATH = '/pickup'
export const SEFL_EXAMPLE_PATH = '/example'
export const SEFL_TRACING_PATH = '/tracing'
export const SEFL_RATE_QUOTE_PATH = '/ratequotes/rest/submitQuote'
export const SEFL_GET_PRO_PATH = '/generatePro/PreAssigned'
export const SEFL_PICKUP_INQUIRY_PATH = '/pickupinquiry'

export const SEFL_DASHBOARD_URL = 'https://www.sefl.com/seflWebsite/webconnect.jsp'

/**
 * SEFL tracking status → canonical TrackingEventStatus map.
 * The tracing API returns descriptive status strings.
 */
export const TRACKING_STATUS_MAP: Record<string, string> = {
  // Pre-transit / pickup
  'Pickup': 'PRE_TRANSIT',
  'Picked Up': 'PRE_TRANSIT',
  'Pickup Requested': 'PRE_TRANSIT',
  // In transit
  'In Transit': 'IN_TRANSIT',
  'Arrived': 'IN_TRANSIT',
  'Departed': 'IN_TRANSIT',
  'Transfer': 'IN_TRANSIT',
  'Loaded': 'IN_TRANSIT',
  'Unloaded': 'IN_TRANSIT',
  'Linehaul': 'IN_TRANSIT',
  // Out for delivery
  'Out for Delivery': 'OUT_FOR_DELIVERY',
  'On Truck': 'OUT_FOR_DELIVERY',
  // Delivered
  'Delivered': 'DELIVERED',
  'Delivery': 'DELIVERED',
  // Exceptions / issues
  'Exception': 'FAILURE',
  'Delay': 'FAILURE',
  'Refused': 'FAILURE',
  'Returned': 'RETURN_TO_SENDER',
  'Return': 'RETURN_TO_SENDER',
}

/**
 * Package type codes accepted by the SEFL pickup API.
 */
export const PKG_TYPE_CODES = {
  PT: 'Pallet',
  RL: 'Roll',
  BX: 'Box',
  BL: 'Bundle',
  DR: 'Drum',
  MS: 'Misc',
  CT: 'Carton',
  CL: 'Cylinder',
  PC: 'Piece',
  SK: 'Skid',
  TB: 'Tube',
  TO: 'Tote',
  RE: 'Reel',
  PL: 'Pail',
  CR: 'Crate',
} as const

export type PkgTypeCode = keyof typeof PKG_TYPE_CODES

/**
 * Special number type codes accepted by the SEFL pickup API.
 */
export const SPECIAL_NUM_TYPE_CODES = {
  BOOK: 'Booking #',
  CUST: 'Customer Pickup #',
  CUSTR: 'Customer Routing #',
  LN: 'Load #',
  ORN: 'Order #',
  PO: 'Purchase Order #',
  RA: 'Return Authorization #',
  RATE: 'Quote #',
} as const

/** Default freighter country when zip is domestic. */
export const DEFAULT_COUNTRY = 'US'
