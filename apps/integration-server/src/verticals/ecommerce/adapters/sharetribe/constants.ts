/**
 * Sharetribe Flex Integration API constants.
 *
 * Sharetribe exposes two distinct API hosts:
 *  - Authentication API: https://flex-api.sharetribe.com
 *  - Integration API:    https://flex-integ-api.sharetribe.com
 *
 * The Integration API requires an `integ`-scoped access token obtained via the
 * client_credentials OAuth2 grant using the marketplace's clientId + clientSecret.
 *
 * Docs: https://www.sharetribe.com/api-reference/integration.html
 * Auth: https://www.sharetribe.com/api-reference/authentication.html
 */

/** Base URL for the Sharetribe OAuth2 token endpoint. */
export const AUTH_BASE_URL = 'https://flex-api.sharetribe.com'

/** Token endpoint path. */
export const TOKEN_PATH = '/v1/auth/token'

/** Base URL for all Sharetribe Integration API endpoints. */
export const INTEGRATION_API_BASE_URL = 'https://flex-integ-api.sharetribe.com/v1/integration_api'

/** Default number of items to request per page. */
export const DEFAULT_PAGE_SIZE = 50

/** Maximum page size accepted by the Sharetribe API. */
export const MAX_PAGE_SIZE = 100

/** OAuth2 scope required for Integration API access. */
export const INTEGRATION_SCOPE = 'integ'
