export const NZPOST_API_BASE = 'https://api.nzpost.co.nz/shipping/v2'
export const NZPOST_TOKEN_PATH = '/oauth/token'
export const NZPOST_DASHBOARD_URL = 'https://www.nzpost.co.nz/business/developer-centre'

export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000
export const RATE_LIMIT_RPS = 10

export const TRACKING_STATUS_MAP: Record<string, string> = {
  PICKED_UP: 'PRE_TRANSIT',
  IN_TRANSIT: 'IN_TRANSIT',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  CARDED: 'FAILURE',
  RETURNED: 'RETURN_TO_SENDER',
}
