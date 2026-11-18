export const FAREYE_API_BASE = 'https://api.fareye.com/v1'

export const FAREYE_OAUTH_AUTHORIZE_URL = 'https://auth.fareye.com/oauth2/authorize'
export const FAREYE_OAUTH_TOKEN_URL = 'https://auth.fareye.com/oauth2/token'

export const DEFAULT_SCOPES = ['read:shipments', 'read:tracking', 'read:orders']

export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000

export const TRACKING_STATUS_MAP: Record<string, string> = {
  CREATED: 'PRE_TRANSIT',
  PICKUP_SCHEDULED: 'PRE_TRANSIT',
  PICKED_UP: 'IN_TRANSIT',
  IN_TRANSIT: 'IN_TRANSIT',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  DELIVERY_FAILED: 'FAILURE',
  EXCEPTION: 'FAILURE',
  RETURNED: 'RETURN_TO_SENDER',
  AVAILABLE_FOR_PICKUP: 'AVAILABLE_FOR_PICKUP',
}
