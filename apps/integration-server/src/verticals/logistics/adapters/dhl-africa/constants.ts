export const DHL_AFRICA_API_BASE = 'https://api.dhl.com/africa/v1/'
export const DHL_AFRICA_TOKEN_PATH = '/oauth/token'
export const DHL_AFRICA_DASHBOARD_URL = 'https://developer.dhl.com/'

export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000
export const RATE_LIMIT_RPS = 10

export const TRACKING_STATUS_MAP: Record<string, string> = {
  PROCESSED: 'PRE_TRANSIT',
  IN_TRANSIT: 'IN_TRANSIT',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  EXCEPTION: 'FAILURE',
  RETURNED: 'RETURN_TO_SENDER',
}
