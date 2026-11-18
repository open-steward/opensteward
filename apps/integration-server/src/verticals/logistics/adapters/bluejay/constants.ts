export const BLUEJAY_API_BASE = 'https://api.e2open.com/bluejay/v1/'
export const BLUEJAY_TOKEN_PATH = '/oauth/token'
export const BLUEJAY_DASHBOARD_URL = 'https://www.e2open.com/developer'

export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000
export const RATE_LIMIT_RPS = 20

export const TRACKING_STATUS_MAP: Record<string, string> = {
  CREATED: 'PRE_TRANSIT',
  TENDERED: 'PRE_TRANSIT',
  IN_TRANSIT: 'IN_TRANSIT',
  DELIVERED: 'DELIVERED',
  EXCEPTION: 'FAILURE',
  CANCELLED: 'FAILURE',
}
