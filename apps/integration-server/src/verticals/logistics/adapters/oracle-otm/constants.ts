export const ORACLE_OTM_API_BASE = 'https://api.oracle.com/otm/v1/'
export const ORACLE_OTM_TOKEN_PATH = '/oauth/token'
export const ORACLE_OTM_DASHBOARD_URL = 'https://docs.oracle.com/en/cloud/saas/transportation-management/'

export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000
export const RATE_LIMIT_RPS = 30

export const TRACKING_STATUS_MAP: Record<string, string> = {
  PLANNED: 'PRE_TRANSIT',
  TENDERED: 'PRE_TRANSIT',
  IN_TRANSIT: 'IN_TRANSIT',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'FAILURE',
}
