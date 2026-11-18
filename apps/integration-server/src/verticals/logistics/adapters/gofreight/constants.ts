export const GOFREIGHT_API_BASE = 'https://api.core.gofreight.co'
export const GOFREIGHT_DASHBOARD_URL = 'https://app.gofreight.com'

/** How many milliseconds before nominal expiry we treat an API key as needing refresh. */
export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000

/** Conservative rate limit — GoFreight does not publish exact limits. */
export const RATE_LIMIT_RPS = 10

/** The header used to authenticate GoFreight API requests. */
export const AUTH_HEADER = 'X-GATEWAY-TOKEN'

/** The header that carries the HMAC-SHA256 webhook signature: `{timestamp}.{hash}` */
export const WEBHOOK_SIGNATURE_HEADER = 'x-gofreight-signature'

/** The header that carries the webhook subscription reference used to look up the secret. */
export const WEBHOOK_SUBSCRIPTION_REF_HEADER = 'x-gofreight-webhook-subscription-ref'

/** Maximum age in milliseconds of a webhook timestamp before we reject it (replay protection). */
export const WEBHOOK_MAX_AGE_MS = 5 * 60 * 1000

export const SHIPMENT_STATUS_MAP: Record<string, string> = {
  // Ocean import master bill statuses
  pending: 'PENDING',
  booking_confirmed: 'PENDING',
  in_transit: 'IN_TRANSIT',
  arrived: 'IN_TRANSIT',
  delivered: 'DELIVERED',
  cancelled: 'CANCELLED',
  // Generic fallbacks
  created: 'LABEL_CREATED',
  completed: 'DELIVERED',
}

export const TRACKING_STATUS_MAP: Record<string, string> = {
  pre_transit: 'PRE_TRANSIT',
  in_transit: 'IN_TRANSIT',
  out_for_delivery: 'OUT_FOR_DELIVERY',
  delivered: 'DELIVERED',
  available_for_pickup: 'AVAILABLE_FOR_PICKUP',
  return_to_sender: 'RETURN_TO_SENDER',
  failure: 'FAILURE',
  exception: 'FAILURE',
  unknown: 'UNKNOWN',
}
