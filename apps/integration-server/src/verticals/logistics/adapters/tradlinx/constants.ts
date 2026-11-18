export const TRADLINX_API_BASE = 'https://api.tradlinx.com/v1'
export const TRADLINX_DASHBOARD_URL = 'https://tradlinx.com'
export const RATE_LIMIT_RPS = 10
export const DEFAULT_PAGE_SIZE = 20

export const SHIPMENT_STATUS_MAP: Record<string, string> = {
  booked: 'PENDING',
  departed: 'IN_TRANSIT',
  in_transit: 'IN_TRANSIT',
  arrived: 'IN_TRANSIT',
  delivered: 'DELIVERED',
  exception: 'EXCEPTION',
  cancelled: 'CANCELLED',
}

export const TRACKING_STATUS_MAP: Record<string, string> = {
  booked: 'PRE_TRANSIT',
  departed: 'IN_TRANSIT',
  in_transit: 'IN_TRANSIT',
  arrived: 'IN_TRANSIT',
  delivered: 'DELIVERED',
  exception: 'FAILURE',
}
