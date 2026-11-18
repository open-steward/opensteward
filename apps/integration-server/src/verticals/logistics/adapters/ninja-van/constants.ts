export const NINJAVAN_API_BASE = 'https://api.ninjavan.co/v2'
export const NINJAVAN_TOKEN_PATH = '/oauth/access_token'
export const NINJAVAN_DASHBOARD_URL = 'https://api-docs.ninjavan.co/'

export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000
export const RATE_LIMIT_RPS = 30

export const TRACKING_STATUS_MAP: Record<string, string> = {
  Pending: 'PRE_TRANSIT',
  PickedUp: 'PRE_TRANSIT',
  InTransit: 'IN_TRANSIT',
  OutForDelivery: 'OUT_FOR_DELIVERY',
  Completed: 'DELIVERED',
  Failed: 'FAILURE',
  ReturnedToSender: 'RETURN_TO_SENDER',
  OnHold: 'UNKNOWN',
}
