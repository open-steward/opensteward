/**
 * fabric (YC-backed composable headless commerce) constants.
 *
 * fabric exposes a unified REST API at `https://api.fabric.inc/v3/` across
 * Products (PIM), Orders (OMS), Customers, and Inventory services.
 *
 * Auth: API key + OAuth2 client-credentials grant.
 * Pagination: offset-based with `offset` + `limit` query params.
 */

export const BASE_URL = 'https://api.fabric.inc/v3'

/** Default items per page for list endpoints. */
export const DEFAULT_PAGE_SIZE = 25

/** Maximum items per page. */
export const MAX_PAGE_SIZE = 100

/** OAuth2 token lifetime in seconds; refresh 5 min early. */
export const TOKEN_LIFETIME_SECONDS = 3300

/** OAuth2 token endpoint path. */
export const TOKEN_ENDPOINT = '/oauth/token'

/** Content-Type for all requests. */
export const CONTENT_TYPE = 'application/json'
