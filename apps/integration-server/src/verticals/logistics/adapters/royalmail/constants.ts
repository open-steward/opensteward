export const ROYALMAIL_API_BASE = 'https://api.royalmail.net/shipping/v3'
export const ROYALMAIL_TOKEN_PATH = '/oauth2/token'
export const ROYALMAIL_DASHBOARD_URL = 'https://developer.royalmail.net/'

export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000
export const RATE_LIMIT_RPS = 30

export const TRACKING_STATUS_MAP: Record<string, string> = {
  RECEIVED: 'PRE_TRANSIT',
  IN_TRANSIT: 'IN_TRANSIT',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  ATTEMPTED: 'FAILURE',
  RETURNED: 'RETURN_TO_SENDER',
  EXCEPTION: 'FAILURE',
}
