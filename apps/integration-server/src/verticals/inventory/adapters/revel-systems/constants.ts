/**
 * Revel Systems API constants.
 *
 * Base URL:  https://[subdomain].revelup.com/resources/
 * Auth:      OAuth2 client_credentials — token from authentication.revelup.com
 * Pagination: ?limit=N&offset=N  →  { meta: { limit, offset, total_count, next, previous }, objects: [...] }
 */

/** Token endpoint for Revel's OAuth2 client_credentials flow. */
export const TOKEN_URL = 'https://authentication.revelup.com/oauth/token'

/** Audience claim required when requesting tokens. */
export const TOKEN_AUDIENCE = 'https://api.revelsystems.com'

/**
 * Per-merchant resource base.
 * Replace {subdomain} with the merchant's Revel subdomain (without .revelup.com).
 */
export const API_BASE_URL_TEMPLATE = 'https://{subdomain}.revelup.com/resources'

/** Number of records to request per page. */
export const DEFAULT_PAGE_SIZE = 100

/** Milliseconds before expiry at which we proactively refresh the access token. */
export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000
