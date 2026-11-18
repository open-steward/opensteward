/**
 * Flipkart Seller API constants.
 *
 * Flipkart's seller-facing REST API uses token-based OAuth2 authentication.
 * The base URL is the same across all sellers; auth tokens are scoped to a
 * seller account. All endpoints are prefixed with `/sellers/`.
 *
 * Docs: https://seller.flipkart.com/api-docs/
 */

/** Base URL for the Flipkart Seller API. */
export const BASE_URL = 'https://api.flipkart.net/sellers'

/** Flipkart OAuth2 token endpoint. */
export const TOKEN_ENDPOINT = 'https://api.flipkart.net/oauth-service/oauth/token'

/** Flipkart OAuth2 authorize endpoint. */
export const AUTH_ENDPOINT = 'https://api.flipkart.net/oauth-service/oauth/authorize'

/** Refresh 10 minutes before the token's expires_in runs out. */
export const TOKEN_BUFFER_MS = 10 * 60 * 1000

/** Default list page size. */
export const DEFAULT_PAGE_SIZE = 20

/** Flipkart Seller API namespace paths (relative to BASE_URL). */
export const LISTINGS_BASE = '/listings/v3'
export const ORDERS_BASE = '/orders'
export const SHIPMENTS_BASE = '/shipments'
export const RETURNS_BASE = '/returns'
