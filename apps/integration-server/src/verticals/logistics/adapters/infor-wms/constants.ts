export const INFOR_WMS_API_BASE = 'https://api.infor.com/wms/v1/'
export const INFOR_WMS_TOKEN_PATH = '/oauth/token'
export const INFOR_WMS_DASHBOARD_URL = 'https://developer.infor.com/'

export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000
export const RATE_LIMIT_RPS = 20

export const ORDER_STATUS_MAP: Record<string, string> = {
  NEW: 'PENDING',
  ALLOCATED: 'PROCESSING',
  WAVE_PLANNED: 'PROCESSING',
  PICKED: 'AWAITING_SHIPMENT',
  SHIPPED: 'SHIPPED',
  CANCELLED: 'CANCELLED',
}
