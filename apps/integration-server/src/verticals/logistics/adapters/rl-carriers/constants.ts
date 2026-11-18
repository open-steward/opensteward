export const RL_CARRIERS_API_BASE = 'https://api.rlc.com'
export const RL_CARRIERS_DASHBOARD_URL = 'https://www.rlcarriers.com/freight/shipping-software/api'

/**
 * R+L Carriers uses a simple API key header named "apiKey".
 * The key is issued via the MyRLC Account portal.
 */
export const RL_CARRIERS_API_KEY_HEADER = 'apiKey'

/**
 * Supported TraceType values for /ShipmentTracing
 */
export const TRACE_TYPE_PRO = 'ProNumber'
export const TRACE_TYPE_PICKUP = 'PickupID'
export const TRACE_TYPE_BOL = 'BolNumber'
export const TRACE_TYPE_PO = 'PurchaseOrder'

/**
 * Map R+L Carriers status descriptions → canonical TrackingEventStatus.
 * R+L does not expose a formal status code; descriptions are matched case-insensitively.
 */
export const TRACKING_STATUS_MAP: Record<string, string> = {
  'picked up': 'PRE_TRANSIT',
  'out for pickup': 'PRE_TRANSIT',
  'in transit': 'IN_TRANSIT',
  'at service center': 'IN_TRANSIT',
  'arrived': 'IN_TRANSIT',
  'departed': 'IN_TRANSIT',
  'out for delivery': 'OUT_FOR_DELIVERY',
  'delivered': 'DELIVERED',
  'delivery attempted': 'FAILURE',
  'exception': 'FAILURE',
  'available for pickup': 'AVAILABLE_FOR_PICKUP',
  'return': 'RETURN_TO_SENDER',
  'cancelled': 'FAILURE',
}

/**
 * R+L Carriers LTL freight class codes (NMFC).
 */
export const FREIGHT_CLASSES = [
  '50', '55', '60', '65', '70', '77.5', '85', '92.5',
  '100', '110', '125', '150', '175', '200', '250', '300', '400', '500',
] as const
