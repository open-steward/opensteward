/**
 * Shoplazza Admin REST API constants.
 *
 * The Shoplazza Admin REST API is versioned bi-annually. We pin the current
 * stable version (2025-06) here — bump when the adapter is re-tested against
 * a newer release.
 *
 * Base URL pattern: https://{shopdomain}.myshoplaza.com/openapi/{version}/{resource}
 *
 * Docs: https://www.shoplazza.dev/reference/api-usage
 */
export const API_VERSION = '2025-06'

/** Shoplazza's REST host suffix (note: "myshoplaza.com", single 'z'). */
export const HOST_SUFFIX = 'myshoplaza.com'

/** Path prefix for all Admin REST API calls. */
export const API_PREFIX = 'openapi'

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 250

/**
 * Documented per-endpoint page-size ceilings (2025-06). Products ("Limit per
 * page, maximum 250"), orders ("Range: 1-250"), customers ("the maximum is
 * 250") and price_rules ("Ranges from 1 to 250") take 250; collections
 * ("Range: 1-100") takes 100. Locations and inventory_levels state no
 * maximum; they are held to MAX_PAGE_SIZE so a caller's limit never exceeds
 * what the rest of the API accepts.
 */
export const COLLECTIONS_MAX_PAGE_SIZE = 100

/**
 * Default OAuth scopes for a full-featured install. Callers can narrow this
 * via `ShoplazzaAdapterConfig.scopes` if their app only needs a subset.
 *
 * Shoplazza's official scope naming (from
 * https://www.shoplazza.dev/docs/app/shoplazza-api-overview/access-scopes-copy):
 *   read_product / write_product (singular),
 *   read_order / write_order, read_customer / write_customer, etc.
 *
 * Note: there are no separate scopes for fulfillments, inventory_levels, or
 * locations in Shoplazza's published scope list (v2025-06). Fulfillments are
 * nested under orders and are covered by read_order / write_order. Inventory
 * levels and locations (new in 2025-06) are covered by read_product /
 * write_product.
 */
export const DEFAULT_SCOPES = [
  'read_product',
  'write_product',
  'read_collection',
  'write_collection',
  'read_order',
  'write_order',
  'read_customer',
  'write_customer',
  'read_price_rules',
  'write_price_rules',
]
