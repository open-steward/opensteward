export const MANHATTAN_WMS_API_BASE = 'https://api.manh.com/wms/v1/'
export const MANHATTAN_WMS_TOKEN_PATH = '/oauth/token'
export const MANHATTAN_WMS_DASHBOARD_URL = 'https://developer.manh.com/'

export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000
export const RATE_LIMIT_RPS = 20

export const ORDER_STATUS_MAP: Record<string, string> = {
  RECEIVED: 'PENDING',
  ALLOCATED: 'PROCESSING',
  PICKING: 'PROCESSING',
  PACKED: 'AWAITING_SHIPMENT',
  SHIPPED: 'SHIPPED',
  CANCELLED: 'CANCELLED',
}
