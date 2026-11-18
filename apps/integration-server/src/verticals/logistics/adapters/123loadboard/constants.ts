export const LOADBOARD_API_BASE = 'https://api.123loadboard.com/v2'
export const LOADBOARD_DASHBOARD_URL = 'https://www.123loadboard.com/api/'

export const RATE_LIMIT_RPS = 10

export const LOAD_STATUS_MAP: Record<string, string> = {
  AVAILABLE: 'PENDING',
  BOOKED: 'LABEL_CREATED',
  PICKED_UP: 'IN_TRANSIT',
  IN_TRANSIT: 'IN_TRANSIT',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
  EXPIRED: 'CANCELLED',
}

export const TRACKING_STATUS_MAP: Record<string, string> = {
  AVAILABLE: 'PRE_TRANSIT',
  BOOKED: 'PRE_TRANSIT',
  PICKED_UP: 'IN_TRANSIT',
  IN_TRANSIT: 'IN_TRANSIT',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'FAILURE',
  EXPIRED: 'FAILURE',
}
