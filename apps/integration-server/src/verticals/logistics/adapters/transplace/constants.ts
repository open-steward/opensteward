export const TRANSPLACE_API_BASE = 'https://api.transplace.com/v1/'
export const TRANSPLACE_TOKEN_PATH = '/oauth/token'
export const TRANSPLACE_DASHBOARD_URL = 'https://www.uber.com/us/en/freight/transplace'

export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000
export const RATE_LIMIT_RPS = 15

export const TRACKING_STATUS_MAP: Record<string, string> = {
  BOOKED: 'PRE_TRANSIT',
  PICKED_UP: 'PRE_TRANSIT',
  IN_TRANSIT: 'IN_TRANSIT',
  DELIVERED: 'DELIVERED',
  EXCEPTION: 'FAILURE',
}
