export const JDA_API_BASE = 'https://api.blueyonder.com/tms/v1/'
export const JDA_TOKEN_PATH = '/oauth/token'
export const JDA_DASHBOARD_URL = 'https://blueyonder.com/developer'

export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000
export const RATE_LIMIT_RPS = 20

export const TRACKING_STATUS_MAP: Record<string, string> = {
  PLANNED: 'PRE_TRANSIT',
  DISPATCHED: 'PRE_TRANSIT',
  IN_TRANSIT: 'IN_TRANSIT',
  ARRIVED: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'FAILURE',
}
