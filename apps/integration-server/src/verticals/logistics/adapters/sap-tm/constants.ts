export const SAP_TM_API_BASE = 'https://api.sap.com/tm/v1/'
export const SAP_TM_TOKEN_PATH = '/oauth/token'
export const SAP_TM_DASHBOARD_URL = 'https://api.sap.com/'

export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000
export const RATE_LIMIT_RPS = 30

export const TRACKING_STATUS_MAP: Record<string, string> = {
  PLANNED: 'PRE_TRANSIT',
  RELEASED: 'PRE_TRANSIT',
  IN_EXECUTION: 'IN_TRANSIT',
  COMPLETED: 'DELIVERED',
  CANCELLED: 'FAILURE',
}
