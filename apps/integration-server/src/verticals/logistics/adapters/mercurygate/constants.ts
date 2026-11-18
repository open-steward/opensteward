export const MERCURYGATE_API_BASE = 'https://api.mercurygate.com/v2/'
export const MERCURYGATE_TOKEN_PATH = '/oauth/token'
export const MERCURYGATE_DASHBOARD_URL = 'https://www.mercurygate.com/developer'

export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000
export const RATE_LIMIT_RPS = 15

export const TRACKING_STATUS_MAP: Record<string, string> = {
  TENDERED: 'PRE_TRANSIT',
  ACCEPTED: 'PRE_TRANSIT',
  IN_TRANSIT: 'IN_TRANSIT',
  DELIVERED: 'DELIVERED',
  REJECTED: 'FAILURE',
  CANCELLED: 'FAILURE',
}
