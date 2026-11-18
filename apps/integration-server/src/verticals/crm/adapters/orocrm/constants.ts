/**
 * OroCRM API constants.
 *
 * OroCRM is self-hosted; the base URL is customer-configured. These constants
 * define path segments and default values. The full base URL is supplied by
 * the adapter config (baseUrl option).
 *
 * Docs: https://doc.oroinc.com/backend/api/
 */

/** Path suffix appended to baseUrl for all JSON:API requests. */
export const API_PATH = '/api'

/**
 * OAuth2 token endpoint path (relative to baseUrl).
 * Full URL: `{baseUrl}/oauth2-token`
 */
export const OAUTH_TOKEN_PATH = '/oauth2-token'

/**
 * OAuth2 authorization endpoint path (relative to baseUrl).
 * Full URL: `{baseUrl}/oauth2-token/authorize`
 * For back-office this is `{baseUrl}/{backendPrefix}/oauth2-token/authorize`.
 */
export const OAUTH_AUTHORIZE_PATH = '/oauth2-token/authorize'

/** Default page size for paginated requests. OroCRM default is 10; we request 25. */
export const DEFAULT_PAGE_SIZE = 25

/** Required media type for all JSON:API requests. */
export const JSON_API_MEDIA_TYPE = 'application/vnd.api+json'
