/**
 * Billie REST API constants.
 *
 * Billie ("buy now, pay later" for B2B) runs two fully separate environments:
 * a sandbox backed by a Billie test account, and production. Both share the
 * `/api/v2` path prefix, and the same host serves the OAuth token endpoint and
 * the resource endpoints.
 *
 * Docs: https://docs.billie.io/reference/authentication
 */
export const API_BASE_URL = 'https://paella.billie.io/api/v2'
export const SANDBOX_API_BASE_URL = 'https://paella-sandbox.billie.io/api/v2'

/** OAuth2 client-credentials token endpoint, relative to the API base. */
export const OAUTH_TOKEN_PATH = '/oauth/token'

export const PRODUCTION_TOKEN_URL = `${API_BASE_URL}${OAUTH_TOKEN_PATH}`
export const SANDBOX_TOKEN_URL = `${SANDBOX_API_BASE_URL}${OAUTH_TOKEN_PATH}`

/**
 * Billie settles in euros only; the order/invoice payloads carry no per-order
 * ISO 4217 code, so transforms default to EUR.
 */
export const DEFAULT_CURRENCY = 'EUR'
