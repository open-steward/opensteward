/**
 * Wish Merchant API constants.
 *
 * The Wish Merchant REST API is versioned at v2 for resource operations and
 * v3 for OAuth. We pin these known-good URLs here — update when the adapter
 * is re-tested against a newer version.
 *
 * Docs: https://merchant.wish.com/documentation/api/v3/reference
 */

/** Production REST base URL (trailing slash included for axios baseURL). */
export const PROD_BASE_URL = 'https://merchant.wish.com/api/v2/'

/** Sandbox REST base URL. */
export const SANDBOX_BASE_URL = 'https://sandbox.merchant.wish.com/api/v2/'

/** OAuth2 authorize endpoint (production). */
export const OAUTH_AUTHORIZE_URL = 'https://merchant.wish.com/v3/oauth/authorize'

/** OAuth2 sandbox authorize endpoint. */
export const OAUTH_AUTHORIZE_URL_SANDBOX = 'https://sandbox.merchant.wish.com/v3/oauth/authorize'

/**
 * OAuth2 token exchange endpoint.
 * Note: Wish uses GET (not POST) for token exchange.
 */
export const OAUTH_TOKEN_URL = 'https://merchant.wish.com/api/v3/oauth/access_token'

/** OAuth2 refresh token endpoint. */
export const OAUTH_REFRESH_URL = 'https://merchant.wish.com/api/v3/oauth/refresh_token'

/**
 * Access token lifetime in seconds (30 days).
 * Wish tokens expire 30 days after issuance.
 */
export const ACCESS_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60 // 30 days

// ── API v3 (reads) ──────────────────────────────────────────────────────────
//
// Every /api/v2 path answers 404 "Page not found" (code 4004); the current
// first-party spec (openapi 3.0.0 behind
// https://merchant.wish.com/documentation/api/v3/reference) has no v2 path and
// declares one server: "url": "https://merchant.wish.com". The write methods
// above still use the v2 client and are out of scope for this rebuild.

/** v3 production host: the spec's `servers[0].url`. Paths carry `/api/v3/…`. */
export const V3_PROD_HOST = 'https://merchant.wish.com'

/**
 * v3 sandbox host: "To use the sandbox in testing, use
 * https://sandbox.merchant.wish.com/api/v3/ as your base URL."
 */
export const V3_SANDBOX_HOST = 'https://sandbox.merchant.wish.com'

/**
 * GET /api/v3/products `limit`: "integer", "minimum": 1, "maximum": 1000,
 * "default": 50 — "The limit on the number of products that will be returned."
 */
export const PRODUCTS_MAX_LIMIT = 1000

/**
 * GET /api/v3/orders `limit`: "minimum": 1, "maximum": 500, "default": 50 —
 * "Specify a limit on the number of orders that can be returned."
 */
export const ORDERS_MAX_LIMIT = 500

/**
 * The documented default of both lists' `limit` ("default": 50). Used when
 * a caller names no limit, and as the product-list page size of the variant
 * and inventory fan-outs, which fetch GET /api/v3/products/{id} once per
 * listed product.
 */
export const V3_DEFAULT_LIMIT = 50

/**
 * Every value of GET /api/v3/products `statuses` ("enum": ["PENDING_REVIEW",
 * "APPROVED", "REJECTED", "REMOVED_BY_WISH", "REMOVED_BY_MERCHANT"]). Sent on
 * every product list request because the parameter's default hides the rest:
 * "Only return products with the given statuses. Default to PENDING_REVIEW +
 * APPROVED." Without it, a full walk would silently leave out REJECTED and
 * removed products.
 */
export const PRODUCT_STATUSES = [
  'PENDING_REVIEW',
  'APPROVED',
  'REJECTED',
  'REMOVED_BY_WISH',
  'REMOVED_BY_MERCHANT',
] as const
