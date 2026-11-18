/**
 * Payhip REST API v2 constants.
 *
 * Base URL: https://payhip.com/api/v2
 * Auth: `payhip-api-key` request header (API key found in Settings → Developer).
 * Pagination: offset-based (`limit` 1-100, `offset` ≥0).
 *
 * Docs: https://payhip.com/api-reference
 */
export const API_BASE_URL = 'https://payhip.com/api/v2'

/** Default and maximum items per page per Payhip docs. */
export const DEFAULT_PAGE_SIZE = 10
export const MAX_PAGE_SIZE = 100
