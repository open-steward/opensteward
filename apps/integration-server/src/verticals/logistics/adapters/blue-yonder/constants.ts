export const BLUE_YONDER_API_BASE = 'https://api.blueyonder.com/v1'

export const BLUE_YONDER_OAUTH_AUTHORIZE_URL =
  'https://auth.blueyonder.com/oauth2/authorize'
export const BLUE_YONDER_OAUTH_TOKEN_URL =
  'https://auth.blueyonder.com/oauth2/token'

export const DEFAULT_SCOPES = [
  'shipments:read',
  'tracking:read',
  'orders:read',
  'warehouses:read',
].join(' ')

export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000
export const RATE_LIMIT_RPS = 20

export const TRACKING_STATUS_MAP: Record<string, string> = {
  CREATED: 'PRE_TRANSIT',
  TENDERED: 'PRE_TRANSIT',
  PICKED_UP: 'IN_TRANSIT',
  IN_TRANSIT: 'IN_TRANSIT',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  AVAILABLE_FOR_PICKUP: 'AVAILABLE_FOR_PICKUP',
  RETURN_TO_SENDER: 'RETURN_TO_SENDER',
  EXCEPTION: 'FAILURE',
  CANCELLED: 'FAILURE',
}

export const SHIPMENT_STATUS_MAP: Record<string, string> = {
  CREATED: 'LABEL_CREATED',
  PLANNED: 'PENDING',
  TENDERED: 'PENDING',
  IN_TRANSIT: 'IN_TRANSIT',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  EXCEPTION: 'EXCEPTION',
  RETURNED: 'RETURNED',
  CANCELLED: 'CANCELLED',
}
