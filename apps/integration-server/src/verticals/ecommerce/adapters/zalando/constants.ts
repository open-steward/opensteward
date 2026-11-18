/**
 * Zalando zDirect API constants.
 *
 * The zDirect API is versioned in the base URL. We target v1 (the current
 * stable version). Bump `PROD_BASE_URL` / `SANDBOX_BASE_URL` if Zalando
 * releases a v2 and this adapter is re-certified against it.
 *
 * Docs: https://developers.merchants.zalando.com/docs/api-overview.html
 */

export const PROD_BASE_URL = 'https://api.merchants.zalando.com'
export const SANDBOX_BASE_URL = 'https://api-sandbox.merchants.zalando.com'

/**
 * Token endpoint, on the same host as the API (production or sandbox).
 * "Use the /auth/token endpoint to request an access token." The sample
 * request posts to https://api-sandbox.merchants.zalando.com/auth/token, and
 * every spec's tokenUrl is https://api(-sandbox).merchants.zalando.com/auth/token.
 * https://developers.merchants.zalando.com/docs/requesting-access-token.html
 */
export const TOKEN_PATH = '/auth/token'

/** Zalando issues access tokens with a 2-hour TTL (7200 s). */
export const TOKEN_TTL_SECONDS = 7200

export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 200
/**
 * Orders API page[size]: "Possible values 1..1000".
 * https://developers.merchants.zalando.com/docs/orders-api-get-orders.html
 */
export const ORDERS_MAX_PAGE_SIZE = 1000

/**
 * Token-request scope. The docs say to "provide the scope access_token_only
 * (to make sure we will not issue a refresh token)", and note that since
 * 1 July 2021 it is no longer required. API scopes are assigned to the app in
 * the zDirect Portal.
 * https://developers.merchants.zalando.com/docs/requesting-access-token.html
 */
export const DEFAULT_SCOPE = 'access_token_only'
