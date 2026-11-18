/** Gophr UK V2 Commercial API constants */

export const GOPHR_UK_API_BASE = 'https://api.gophr.com/v2-commercial-api'
export const GOPHR_UK_SANDBOX_API_BASE = 'https://api-sandbox.gophr.com/v2-commercial-api'
export const GOPHR_UK_DASHBOARD_URL = 'https://app.gophr.com'
export const GOPHR_UK_API_KEY_HEADER = 'API-KEY'
export const RATE_LIMIT_RPS = 10

/** Map Gophr UK job/delivery statuses → canonical TrackingEventStatus */
export const TRACKING_STATUS_MAP: Record<string, string> = {
  new:               'PRE_TRANSIT',
  created:           'PRE_TRANSIT',
  confirmed:         'PRE_TRANSIT',
  accepted:          'IN_TRANSIT',
  at_pickup:         'IN_TRANSIT',
  collected:         'IN_TRANSIT',
  en_route:          'IN_TRANSIT',
  out_for_delivery:  'OUT_FOR_DELIVERY',
  at_delivery:       'OUT_FOR_DELIVERY',
  taking_signature:  'OUT_FOR_DELIVERY',
  delivered:         'DELIVERED',
  returned:          'RETURN_TO_SENDER',
  cancelled:         'FAILURE',
  canceled:          'FAILURE',
  failed:            'FAILURE',
}

/** Map Gophr UK job/delivery statuses → canonical ShipmentStatus */
export const SHIPMENT_STATUS_MAP: Record<string, string> = {
  new:               'PENDING',
  created:           'LABEL_CREATED',
  confirmed:         'LABEL_CREATED',
  accepted:          'IN_TRANSIT',
  at_pickup:         'IN_TRANSIT',
  collected:         'IN_TRANSIT',
  en_route:          'IN_TRANSIT',
  out_for_delivery:  'OUT_FOR_DELIVERY',
  at_delivery:       'OUT_FOR_DELIVERY',
  taking_signature:  'OUT_FOR_DELIVERY',
  delivered:         'DELIVERED',
  returned:          'RETURNED',
  cancelled:         'CANCELLED',
  canceled:          'CANCELLED',
  failed:            'EXCEPTION',
}
