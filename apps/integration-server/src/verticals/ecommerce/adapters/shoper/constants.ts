/**
 * Shoper REST API constants.
 *
 * The Shoper REST API lives under `/webapi/rest` on the store's own domain.
 * There is no versioned path segment — the API is identified only by the
 * store URL. Tokens issued via the AppStore OAuth flow are valid for 90 days
 * (access token) and 180 days (refresh token).
 *
 * Docs: https://developers.shoper.pl/developers/api/getting-started
 */

/** Max records per page Shoper returns. */
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 50

/** Shoper REST API path prefix (relative to the store root). */
export const API_PATH = 'webapi/rest'

/**
 * Shoper AppStore OAuth2 scopes for a full read/write install.
 * The scope identifiers follow the pattern
 * `{resource}_{permission}` documented in the AppStore developer portal.
 */
export const DEFAULT_SCOPES = [
  'products_read',
  'products_write',
  'categories_read',
  'categories_write',
  'orders_read',
  'orders_write',
  'users_read',
  'users_write',
  'warehouses_read',
  'warehouses_write',
  'deliveries_read',
  'payments_read',
  'discounts_read',
  'discounts_write',
]
