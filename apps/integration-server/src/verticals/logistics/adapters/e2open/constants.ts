export const E2OPEN_API_BASE = 'https://api.e2open.com/v1'
export const E2OPEN_OAUTH_AUTHORIZE_URL = 'https://login.e2open.com/oauth2/authorize'
export const E2OPEN_OAUTH_TOKEN_URL = 'https://login.e2open.com/oauth2/token'

/** Minimum buffer before token expiry at which we proactively refresh. */
export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000

/** Conservative requests-per-second limit for retry back-off. */
export const RATE_LIMIT_RPS = 20

/** Default OAuth2 scopes requested when generating an authorization URL. */
export const DEFAULT_SCOPES = ['openid', 'supply_chain', 'shipments', 'tracking']

export const TRACKING_STATUS_MAP: Record<string, string> = {
  PLANNED: 'PRE_TRANSIT',
  BOOKED: 'PRE_TRANSIT',
  PICK_UP: 'PRE_TRANSIT',
  PICKUP: 'PRE_TRANSIT',
  IN_TRANSIT: 'IN_TRANSIT',
  IN_CUSTOMS: 'IN_TRANSIT',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  EXCEPTION: 'FAILURE',
  RETURNED: 'RETURN_TO_SENDER',
  CANCELLED: 'FAILURE',
}

export const SHIPMENT_STATUS_MAP: Record<string, string> = {
  PLANNED: 'PENDING',
  BOOKED: 'LABEL_CREATED',
  IN_TRANSIT: 'IN_TRANSIT',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  EXCEPTION: 'EXCEPTION',
  RETURNED: 'RETURNED',
  CANCELLED: 'CANCELLED',
}
