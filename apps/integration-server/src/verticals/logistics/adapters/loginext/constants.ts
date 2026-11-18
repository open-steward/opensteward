// LogiNext REST API. First-party reference: the vendor's own docs source,
// https://github.com/loginextsolutions/docs (source/index.html.md), since the
// rendered portal (developers.loginextsolutions.com) no longer resolves.
//
// "The base URL for all requests to the LogiNext API is:
//  https://api.loginextsolutions.com/"
export const LOGINEXT_API_BASE = 'https://api.loginextsolutions.com'

// Order "Get": "GET https://api.loginextsolutions.com/ShipmentApp/mile/v1/shipment"
// ("Retrieve orders and all the order associated information with this API.")
export const LOGINEXT_ORDER_GET_PATH = '/ShipmentApp/mile/v1/shipment'

// Order "Get" page_size: "The maximum accepted value is 100; higher values will
// be accepted but you will only get 100 records."
export const LOGINEXT_MAX_PAGE_SIZE = 100

// Order "Get" page_size: "default value (if it isn't specified) will be 50."
export const LOGINEXT_DEFAULT_PAGE_SIZE = 50

// LogiNext dashboard (used as auth redirect target for API-key flow)
export const LOGINEXT_DASHBOARD_URL = 'https://dashboard.loginextsolutions.com'

// Request Headers: "WWW-Authenticate | BASIC 51bbe3f7-... | Authentication token"
export const LOGINEXT_AUTH_HEADER = 'WWW-Authenticate'

// Limits: "Tier 1 APIs ... 5 requests per second"; the Order Get API is
// "API Type: Tier 1 API".
export const RATE_LIMIT_RPS = 5
