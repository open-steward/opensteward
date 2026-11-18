/**
 * Bol.com Retailer API constants.
 *
 * Bol.com is the leading marketplace in the Netherlands and Belgium.
 * The Retailer API uses OAuth2 client-credentials grant. All endpoints
 * live under a single base URL with versioned paths.
 *
 * Docs: https://api.bol.com/retailer/public/
 */

/** Bol.com API base URL (production). */
export const API_BASE_URL = 'https://api.bol.com/retailer'

/** OAuth2 token endpoint. */
export const OAUTH_TOKEN_URL = 'https://login.bol.com/token'

/** Access tokens expire after ~5 minutes; refresh 30s early. */
export const TOKEN_BUFFER_MS = 30 * 1000

/** Default list page size. */
export const DEFAULT_PAGE_SIZE = 25

/** Maximum page size. */
export const MAX_PAGE_SIZE = 50

/** Bol.com API paths (relative to API_BASE_URL). */
export const OFFERS_BASE = '/offers'
export const ORDERS_BASE = '/orders'
export const SHIPMENTS_BASE = '/shipments'
export const RETURNS_BASE = '/returns'
export const INVENTORY_BASE = '/inventory'
