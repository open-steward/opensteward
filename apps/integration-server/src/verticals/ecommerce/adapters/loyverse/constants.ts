/**
 * Loyverse REST API constants.
 *
 * Base URL: https://api.loyverse.com/v1.0
 * Auth: OAuth 2.0 Authorization Code Flow (Bearer token)
 *
 * Pagination uses a cursor returned as `cursor` in list responses. Pass
 * `cursor` as a query parameter to fetch the next page.
 *
 * Rate-limiting: Loyverse enforces per-second and per-day quotas; the
 * client retries 429 responses with exponential backoff.
 */

export const BASE_URL = 'https://api.loyverse.com/v1.0'

/** OAuth2 authorization endpoint (redirect user here). */
export const OAUTH_AUTHORIZE_URL = 'https://cloud.loyverse.com/oauth/authorize'

/** OAuth2 token endpoint (exchange code / refresh token). */
export const OAUTH_TOKEN_URL = 'https://api.loyverse.com/oauth/token'

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 250
