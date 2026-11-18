export const VENIPAK_API_BASE = 'https://go.venipak.lt/'

// Venipak uses username + password + api_id credentials — no OAuth flow.
export const VENIPAK_DASHBOARD_URL = 'https://go.venipak.lt/'

// Endpoint paths (relative to VENIPAK_API_BASE)
export const ENDPOINT_SEND_SHIPMENT = 'import/send.php'
export const ENDPOINT_TRACKING = 'ws/tracking'
export const ENDPOINT_PRINT_LABEL = 'ws/print_label'
export const ENDPOINT_PRINT_LIST = 'ws/print_list'
export const ENDPOINT_PICKUP_POINTS = 'ws/get_pickup_points'
export const ENDPOINT_ROUTES = 'ws/get_route'

// Tracking query type codes used with ENDPOINT_TRACKING
export const TRACKING_TYPE_SINGLE = 1       // single tracking code
export const TRACKING_TYPE_ALL = 2          // all events for code
export const TRACKING_TYPE_LAST_STATUS = 5  // last status only
export const TRACKING_TYPE_SHIPMENT = 7     // full shipment detail

export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100
