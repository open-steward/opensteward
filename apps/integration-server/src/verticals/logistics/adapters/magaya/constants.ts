export const MAGAYA_API_BASE = 'https://api.magaya.com/v1'
export const MAGAYA_DASHBOARD_URL = 'https://live.magaya.com/'

export const RATE_LIMIT_RPS = 10
export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000

export const SHIPMENT_STATUS_MAP: Record<string, string> = {
  Draft: 'PENDING',
  Pending: 'PENDING',
  Confirmed: 'LABEL_CREATED',
  'In Transit': 'IN_TRANSIT',
  'Arrived at Destination': 'IN_TRANSIT',
  Cleared: 'IN_TRANSIT',
  Delivered: 'DELIVERED',
  Cancelled: 'CANCELLED',
  Exception: 'EXCEPTION',
  Returned: 'RETURNED',
}

export const TRACKING_STATUS_MAP: Record<string, string> = {
  Draft: 'PRE_TRANSIT',
  Pending: 'PRE_TRANSIT',
  Confirmed: 'PRE_TRANSIT',
  'In Transit': 'IN_TRANSIT',
  'Arrived at Destination': 'IN_TRANSIT',
  Cleared: 'IN_TRANSIT',
  Delivered: 'DELIVERED',
  Cancelled: 'FAILURE',
  Exception: 'FAILURE',
  Returned: 'RETURN_TO_SENDER',
}
