export const PROJECT44_API_BASE = 'https://na12.api.project44.com/api/v4'
export const PROJECT44_TOKEN_PATH = '/oauth/token'
export const PROJECT44_DASHBOARD_URL = 'https://developers.project44.com/'

export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000
export const RATE_LIMIT_RPS = 30

export const TRACKING_STATUS_MAP: Record<string, string> = {
  'Info Received': 'PRE_TRANSIT',
  'Picked Up': 'PRE_TRANSIT',
  'In Transit': 'IN_TRANSIT',
  'Out for Delivery': 'OUT_FOR_DELIVERY',
  'Delivered': 'DELIVERED',
  'Exception': 'FAILURE',
  'Delayed': 'FAILURE',
}
