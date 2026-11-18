export const FLEXPORT_API_BASE = 'https://api.flexport.com/v2'
export const FLEXPORT_LOGISTICS_API_BASE = 'https://logistics-api.flexport.com/logistics/api/2025-03'
export const FLEXPORT_TOKEN_PATH = '/oauth/token'
export const FLEXPORT_DASHBOARD_URL = 'https://docs.logistics-api.flexport.com/'

export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000
export const RATE_LIMIT_RPS = 30

export const TRACKING_STATUS_MAP: Record<string, string> = {
  booked: 'PRE_TRANSIT',
  confirmed: 'PRE_TRANSIT',
  in_transit: 'IN_TRANSIT',
  arrived: 'IN_TRANSIT',
  delivered: 'DELIVERED',
  cancelled: 'UNKNOWN',
}
