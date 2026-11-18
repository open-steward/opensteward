export const PITNEYBOWES_API_BASE = 'https://api.pitneybowes.com'
export const PITNEYBOWES_TOKEN_PATH = '/oauth/token'
export const PITNEYBOWES_DASHBOARD_URL = 'https://docs.shippingapi.pitneybowes.com/'

export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000
export const RATE_LIMIT_RPS = 20

export const TRACKING_STATUS_MAP: Record<string, string> = {
  InTransit: 'IN_TRANSIT',
  OutForDelivery: 'OUT_FOR_DELIVERY',
  Delivered: 'DELIVERED',
  DeliveryAttempted: 'FAILURE',
  ReturnToSender: 'RETURN_TO_SENDER',
  Manifest: 'PRE_TRANSIT',
}
