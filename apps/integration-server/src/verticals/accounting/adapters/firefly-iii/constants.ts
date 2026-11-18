/**
 * Firefly III API constants.
 *
 * Firefly III is a self-hosted personal finance manager.  There is no single
 * fixed base URL; each deployment lives on the user's own server.  The demo
 * instance (https://demo.firefly-iii.org) is used as a fallback example.
 *
 * Auth (OAuth2 – authorization_code flow):
 *   Authorize : https://<host>/oauth/authorize
 *   Token     : https://<host>/oauth/token
 *
 * REST API v1 base : https://<host>/api/v1/
 *
 * Pagination       : page (1-based integer) + limit (default 50, max 100)
 * Auth header      : Authorization: Bearer <access_token>
 */

/** Demo/sandbox host used when no instance URL is provided. */
export const FIREFLY_DEMO_HOST = 'https://demo.firefly-iii.org'

/** Path prefix appended to the user's instance host for all v1 REST calls. */
export const FIREFLY_API_PATH = '/api/v1'

/** OAuth2 authorize endpoint path on the user's instance. */
export const FIREFLY_OAUTH_AUTHORIZE_PATH = '/oauth/authorize'

/** OAuth2 token (exchange + refresh) endpoint path on the user's instance. */
export const FIREFLY_OAUTH_TOKEN_PATH = '/oauth/token'

/**
 * Rate limit is not officially documented by Firefly III.
 * 60 req/min is a conservative safe default.
 */
export const RATE_LIMIT_RPM = 60

/** Maximum page size accepted by the Firefly III v1 API. */
export const MAX_PAGE_SIZE = 100

/** Default page size used when the caller does not specify a limit. */
export const DEFAULT_PAGE_SIZE = 50
