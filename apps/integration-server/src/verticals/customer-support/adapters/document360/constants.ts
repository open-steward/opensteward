/**
 * Document360 API constants.
 *
 * Production base URL: https://apihub.document360.io
 * US region: https://apihub.us.document360.io
 * Private hosting: https://apihub.{host}.document360.io
 *
 * Auth: static API token in `api_token` request header.
 * Docs: https://apidocs.document360.com/apidocs/requests
 */
export const API_BASE_URL = 'https://apihub.document360.io'
export const API_VERSION = 'v2'

/** Full versioned prefix, e.g. https://apihub.document360.io/v2 */
export const API_BASE = `${API_BASE_URL}/${API_VERSION}`

/** Default page size for list endpoints (max: 100). */
export const DEFAULT_PAGE_SIZE = 25

/** Pagination: Articles endpoint uses `page` (0-based) + `hitsPerPage`. */
export const DEFAULT_HITS_PER_PAGE = 25

/**
 * GET /v2/Teams: skip/take pagination. The spec documents only a default,
 * `take`: "Number of records to return per page. Default: 20." — no maximum.
 */
export const TEAMS_DEFAULT_TAKE = 20

/** Readers: offset-based, each page retrieves up to 5000 records. */
export const DEFAULT_READER_OFFSET = 1
