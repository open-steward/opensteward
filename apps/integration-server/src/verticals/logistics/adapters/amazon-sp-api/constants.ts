export const AMAZON_SP_API_API_BASE = 'https://sellingpartnerapi-na.amazon.com/'
export const AMAZON_SP_API_DASHBOARD_URL = 'https://developer-docs.amazon.com/sp-api/'
export const AMAZON_SP_API_LWA_TOKEN_URL = 'https://api.amazon.com/auth/o2/token'

export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000
export const RATE_LIMIT_RPS = 5

/**
 * Path prefix for the Shipping API v2, relative to `AMAZON_SP_API_API_BASE`.
 * The sibling `amazon-shipping` adapter bakes `shipping/v2/` into its base
 * URL; this adapter spans several SP-API sections (orders/v0, shipping/v2,
 * supplySources/2020-07-01), so the section lives in a path constant instead.
 */
export const SHIPPING_V2 = 'shipping/v2/'

/**
 * Supply Sources API (2020-07-01) — a seller's ship-from locations (stores,
 * warehouses, fulfilment centres), the nearest thing SP-API has to a
 * warehouse resource.
 */
export const SUPPLY_SOURCES_PATH = 'supplySources/2020-07-01/supplySources'

/** Orders API v0: `getOrders` (list) and `getOrder` (`/{orderId}`). */
export const ORDERS_PATH = 'orders/v0/orders'

/** `getOrders` MaxResultsPerPage: "Value must be 1 - 100. Default 100." */
export const ORDERS_MAX_RESULTS_PER_PAGE = 100

/**
 * The lower bound an unfiltered `getOrders` sends as `LastUpdatedAfter`.
 * Orders API v0 reference: "For the JP, AU, and SG marketplaces, the Orders
 * API supports orders from 2016 onward. For all other marketplaces, the
 * Orders API supports orders for the last two years (orders older than this
 * don't show up in the response)." The start of 2016 therefore covers every
 * order the API serves in any marketplace, and a fixed bound keeps page N the
 * same across calls.
 */
export const ORDERS_EARLIEST = '2016-01-01T00:00:00.000Z'
