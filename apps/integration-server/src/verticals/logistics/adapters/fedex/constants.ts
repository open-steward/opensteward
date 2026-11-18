export const FEDEX_API_BASE = 'https://apis.fedex.com'
export const FEDEX_SANDBOX_API_BASE = 'https://apis-sandbox.fedex.com'

export const FEDEX_TOKEN_PATH = '/oauth/token'
export const FEDEX_DASHBOARD_URL = 'https://developer.fedex.com'

// Token lifetime is 3600s; refresh 5 minutes before expiry
export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000

// FedEx API endpoints
export const RATES_PATH = '/rate/v1/rates/quotes'
export const SHIPMENTS_PATH = '/ship/v1/shipments'
export const TRACKING_PATH = '/track/v1/trackingnumbers'
export const PICKUPS_PATH = '/pickup/v1/pickups'
// Cancel is a PUT to a fixed path, keyed by the body (confirmation code +
// operating company + dispatch date), not `PICKUPS_PATH/:id`.
export const PICKUP_CANCEL_PATH = '/pickup/v1/pickups/cancel'
// Ground End of Day Close — the trailing slash is the path as published in
// FedEx's Close API spec (CloseAPI_ShipmentCloseAPI-Resource.json).
export const ENDOFDAY_PATH = '/ship/v1/endofday/'

// FedEx tracking status code → canonical status
export const TRACKING_STATUS_MAP: Record<string, string> = {
  PU: 'IN_TRANSIT',
  IT: 'IN_TRANSIT',
  OD: 'OUT_FOR_DELIVERY',
  DL: 'DELIVERED',
  DE: 'FAILURE',
  RS: 'RETURN_TO_SENDER',
  RP: 'RETURN_TO_SENDER',
  OC: 'PRE_TRANSIT',
}
