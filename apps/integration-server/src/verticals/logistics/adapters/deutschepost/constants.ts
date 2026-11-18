export const DEUTSCHEPOST_API_BASE = 'https://api.deutschepost.com/dpi/v1'
export const DEUTSCHEPOST_TOKEN_PATH = '/oauth/token'
export const DEUTSCHEPOST_DASHBOARD_URL = 'https://developer.deutschepost.com/'

export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000
export const RATE_LIMIT_RPS = 20

export const TRACKING_STATUS_MAP: Record<string, string> = {
  REGISTERED: 'PRE_TRANSIT',
  IN_TRANSIT: 'IN_TRANSIT',
  CUSTOMS: 'IN_TRANSIT',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  EXCEPTION: 'FAILURE',
  RETURNED: 'RETURN_TO_SENDER',
}
