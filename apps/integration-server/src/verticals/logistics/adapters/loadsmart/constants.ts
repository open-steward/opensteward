export const LOADSMART_API_BASE = 'https://api.loadsmart.com/v2/'
export const LOADSMART_TOKEN_PATH = '/oauth/token'
export const LOADSMART_DASHBOARD_URL = 'https://developers.loadsmart.com/'

export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000
export const RATE_LIMIT_RPS = 20

export const TRACKING_STATUS_MAP: Record<string, string> = {
  BOOKED: 'PRE_TRANSIT',
  PICKED_UP: 'PRE_TRANSIT',
  IN_TRANSIT: 'IN_TRANSIT',
  ARRIVING: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'FAILURE',
}
