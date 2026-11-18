export const DAT_API_BASE = 'https://freight.api.dat.com'
export const DAT_OAUTH_AUTHORIZE_URL = 'https://identity.dat.com/oauth2/authorize'
export const DAT_OAUTH_TOKEN_URL = 'https://identity.dat.com/oauth2/token'

export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000
export const RATE_LIMIT_RPS = 10

export const DEFAULT_SCOPES = ['openid', 'dat_freight', 'rates', 'loads', 'offline_access']

export const TRACKING_STATUS_MAP: Record<string, string> = {
  AVAILABLE: 'PRE_TRANSIT',
  PENDING: 'PRE_TRANSIT',
  COVERED: 'PRE_TRANSIT',
  DISPATCHED: 'PRE_TRANSIT',
  IN_TRANSIT: 'IN_TRANSIT',
  AT_PICKUP: 'IN_TRANSIT',
  PICKED_UP: 'IN_TRANSIT',
  AT_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'FAILURE',
  TONU: 'FAILURE',
}
