export const AUSPOST_API_BASE = 'https://digitalapi.auspost.com.au'
export const AUSPOST_TOKEN_PATH = '/oauth/token'
export const AUSPOST_DASHBOARD_URL = 'https://developers.auspost.com.au/'

export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000
export const RATE_LIMIT_RPS = 10

export const TRACKING_STATUS_MAP: Record<string, string> = {
  'Created': 'PRE_TRANSIT',
  'Initiated': 'PRE_TRANSIT',
  'In Transit': 'IN_TRANSIT',
  'In Facility': 'IN_TRANSIT',
  'Onboard for Delivery': 'OUT_FOR_DELIVERY',
  'Delivered to Agent': 'AVAILABLE_FOR_PICKUP',
  'Delivered': 'DELIVERED',
  'Possible Delay': 'FAILURE',
  'Unsuccessful Delivery': 'FAILURE',
  'Returned': 'RETURN_TO_SENDER',
}
