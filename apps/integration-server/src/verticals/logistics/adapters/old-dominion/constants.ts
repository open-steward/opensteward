export const OLDDOMINION_API_BASE = 'https://api.odfl.com/v1'
export const OLDDOMINION_TOKEN_PATH = '/oauth/token'
export const OLDDOMINION_DASHBOARD_URL = 'https://www.odfl.com/us/en/resources/shipping-api-integrations.html'

export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000
export const RATE_LIMIT_RPS = 10

export const TRACKING_STATUS_MAP: Record<string, string> = {
  'Picked Up': 'PRE_TRANSIT',
  'In Transit': 'IN_TRANSIT',
  'Out for Delivery': 'OUT_FOR_DELIVERY',
  'Delivered': 'DELIVERED',
  'Exception': 'FAILURE',
  'Appointment Set': 'IN_TRANSIT',
}
