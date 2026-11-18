export const WAKEO_API_BASE = 'https://api.wakeo.co/v1'
export const WAKEO_DASHBOARD_URL = 'https://app.wakeo.co'
export const RATE_LIMIT_RPS = 10
export const DEFAULT_PAGE_SIZE = 20

export const SHIPMENT_STATUS_MAP: Record<string, string> = {
  booked: 'PENDING',
  in_transit: 'IN_TRANSIT',
  out_for_delivery: 'OUT_FOR_DELIVERY',
  delivered: 'DELIVERED',
  exception: 'EXCEPTION',
  cancelled: 'CANCELLED',
}

export const TRANSPORT_MODE_MAP: Record<string, string> = {
  ocean: 'ocean',
  air: 'air',
  road: 'parcel',
  rail: 'rail',
}
