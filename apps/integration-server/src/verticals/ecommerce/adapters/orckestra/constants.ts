/**
 * Orckestra adapter constants.
 *
 * Orckestra is a composable B2B+B2C commerce platform. API endpoints are
 * hosted per-instance at `https://{instance}.orckestra.cloud/api`.
 * Authentication uses OAuth2 client_credentials (or refresh_token) flow
 * against `https://{instance}.orckestra.cloud/oauth/token`.
 */

/** Default number of items to request per page. */
export const DEFAULT_PAGE_SIZE = 20

/** Maximum page size accepted by the Orckestra API. */
export const MAX_PAGE_SIZE = 100

/**
 * Number of milliseconds before the token's real expiry at which we
 * consider it "about to expire" and proactively refresh.
 */
export const TOKEN_BUFFER_MS = 5 * 60 * 1_000

/** Fallback currency when Orckestra omits the field. */
export const DEFAULT_CURRENCY = 'USD'

/** Base path segment appended after the instance host. */
export const API_BASE_PATH = '/api'

/** OAuth2 token endpoint path. */
export const TOKEN_PATH = '/oauth/token'
