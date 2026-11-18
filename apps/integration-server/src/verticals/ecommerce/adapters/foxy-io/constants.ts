/**
 * Foxy.io (FoxyCart) hAPI constants.
 *
 * The Foxy hAPI is versioned via a request header rather than a URL path.
 * All requests must include: `FOXY-API-VERSION: 1`
 *
 * Base URL: https://api.foxycart.com
 * Auth URL: https://auth.foxy.io/authorize
 * Token URL: https://api.foxycart.com/token
 *
 * Docs: https://api.foxycart.com/docs
 */

export const API_BASE_URL = 'https://api.foxycart.com'
export const AUTH_URL = 'https://auth.foxy.io/authorize'
export const TOKEN_URL = 'https://api.foxycart.com/token'

/** The Foxy hAPI version sent as a request header on every call. */
export const API_VERSION = '1'

/**
 * Default number of records per page.
 * Foxy default is 20; max is 300.
 */
export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 300

/**
 * OAuth2 scopes supported by Foxy.
 * `store_full_access` grants read/write access to a single store.
 * `user_full_access` grants read/write access to user-level resources.
 */
export const DEFAULT_SCOPES = ['store_full_access']
