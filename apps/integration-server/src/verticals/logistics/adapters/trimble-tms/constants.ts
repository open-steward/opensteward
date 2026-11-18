export const TRIMBLE_TMS_API_BASE = 'https://api.trimble.com/tms/v1/'
export const TRIMBLE_TMS_TOKEN_PATH = '/oauth/token'
export const TRIMBLE_TMS_DASHBOARD_URL = 'https://developer.trimble.com/'

export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000
export const RATE_LIMIT_RPS = 20

export const TRACKING_STATUS_MAP: Record<string, string> = {
  PLANNED: 'PRE_TRANSIT',
  DISPATCHED: 'PRE_TRANSIT',
  IN_TRANSIT: 'IN_TRANSIT',
  AT_STOP: 'IN_TRANSIT',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'FAILURE',
}
