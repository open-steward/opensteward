export const XPO_API_BASE = 'https://api.xpo.com/ltl/v1'
export const XPO_TOKEN_PATH = '/oauth/token'
export const XPO_DASHBOARD_URL = 'https://www.xpo.com/help-center/integration-with-customer-systems/api'

export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000
export const RATE_LIMIT_RPS = 10

export const TRACKING_STATUS_MAP: Record<string, string> = {
  'Picked Up': 'PRE_TRANSIT',
  'In Transit': 'IN_TRANSIT',
  'Out for Delivery': 'OUT_FOR_DELIVERY',
  'Delivered': 'DELIVERED',
  'On Hand': 'AVAILABLE_FOR_PICKUP',
  'Exception': 'FAILURE',
}
