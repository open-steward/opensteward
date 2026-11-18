/**
 * E2open Supply Chain Platform API constants.
 *
 * Base: https://api.e2open.com  (staging: https://api.staging.e2open.com)
 * Auth: OAuth 2.0 Bearer (Authorization Code Flow; client_credentials for server-to-server).
 * Primary surface used here: Channel Data Management (CDM) REST API v1.
 *   POST /cdm/v1/transactions  — search/read inventory & POS transactions
 *   POST /cdm/v1/transactions  — submit batch updates (write, not used here)
 * Pagination: offset + limit query params in the request body.
 */
export const API_BASE_URL = 'https://api.e2open.com'
export const API_STAGING_BASE_URL = 'https://api.staging.e2open.com'

/** OAuth 2.0 token endpoint (Authorization Code Flow). */
export const TOKEN_URL = 'https://login.e2open.com/e2open/as/token.oauth2'

/** CDM API path prefix. */
export const CDM_PATH = '/cdm/v1'

/** Default page size for CDM search queries. */
export const DEFAULT_PAGE_SIZE = 100
