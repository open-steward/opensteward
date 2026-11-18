export const UBER_FREIGHT_API_BASE = 'https://api.uber.com/v1/freight/'
export const UBER_FREIGHT_TOKEN_PATH = '/oauth/v2/token'
export const UBER_FREIGHT_DASHBOARD_URL = 'https://developer.uber.com/'

export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000
export const RATE_LIMIT_RPS = 30

export const TRACKING_STATUS_MAP: Record<string, string> = {
  BOOKED: 'PRE_TRANSIT',
  DISPATCHED: 'PRE_TRANSIT',
  IN_TRANSIT: 'IN_TRANSIT',
  AT_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'FAILURE',
}
