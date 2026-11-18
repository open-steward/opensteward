export const MACROPOINT_API_BASE = 'https://api.macropoint.com/v2/'

export const MACROPOINT_DASHBOARD_URL = 'https://www.project44.com/macropoint'

export const RATE_LIMIT_RPS = 20

export const TRACKING_STATUS_MAP: Record<string, string> = {
  CREATED: 'PRE_TRANSIT',
  TRACKING: 'IN_TRANSIT',
  AT_PICKUP: 'PRE_TRANSIT',
  IN_TRANSIT: 'IN_TRANSIT',
  AT_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  STOPPED: 'FAILURE',
}
