/**
 * IdoSell Admin REST API constants.
 *
 * The Admin API is versioned as a path segment (`/api/admin/v8/...`). Every
 * `reference/*.md` page's embedded OpenAPI document declares
 * `servers[0].url = "https://{domain}/api/admin/v8"` with
 * `variables.domain.default = "clientXXX.idosell.com"` — confirmed on:
 *   https://idosell.readme.io/reference/productsproductsget
 *   https://idosell.readme.io/reference/clientsclientsput
 * The `v8` segment is the major version; the OpenAPI `info.version` itself
 * reads `v8.7` (minor revisions do not change the path).
 */
export const API_VERSION = 'v8'

/**
 * Every paginated IdoSell search/list endpoint documents `resultsLimit` as
 * "Value from 1 to 100" (see e.g. productscategoriesget, clientsclientsget,
 * ordersorderssearchpost, returnsreturnsget). There is no per-endpoint
 * variance we found, so one ceiling applies everywhere.
 */
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 100

/**
 * `GET /products/products` and `PUT /products/stocks` both batch by product
 * identifier with a hard cap of 100 ids per request (documented on
 * productsproductsget / productsstocksget).
 */
export const MAX_ID_BATCH = 100

/** IdoSell's fixed `orderStatus` enum (PUT /orders/orders — ordersordersput). */
export const ORDER_STATUSES = [
  'finished_ext',
  'finished',
  'new',
  'payment_waiting',
  'delivery_waiting',
  'on_order',
  'packed',
  'packed_fulfillment',
  'packed_ready',
  'ready',
  'wait_for_dispatch',
  'suspended',
  'joined',
  'missing',
  'lost',
  'false',
  'canceled',
] as const

/** The status PUT /orders/orders uses to cancel an order (see ORDER_STATUSES). */
export const CANCELLED_ORDER_STATUS = 'canceled'
