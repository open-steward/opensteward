/**
 * Orca Scan REST API constants.
 *
 * Auth: API key sent as Bearer token in Authorization header.
 * Base URL: https://api.orcascan.com/v1
 * Rate limit: 15 requests/second; responds with 429 + Retry-After.
 */
export const API_BASE_URL = 'https://api.orcascan.com/v1'
export const DEFAULT_PAGE_SIZE = 100
