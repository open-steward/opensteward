export const ECHO_API_BASE = 'https://api.echo.com/v2/'
export const ECHO_TOKEN_PATH = '/oauth/token'
export const ECHO_DASHBOARD_URL = 'https://www.echo.com/technology'

export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000
export const RATE_LIMIT_RPS = 20

export const TRACKING_STATUS_MAP: Record<string, string> = {
  BOOKED: 'PRE_TRANSIT',
  DISPATCHED: 'PRE_TRANSIT',
  IN_TRANSIT: 'IN_TRANSIT',
  AT_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'FAILURE',
}
