/**
 * Qoblex REST API constants.
 *
 * Auth: single API key sent as `qoblex-x-api-key` header.
 * Pagination: 0-based `page` param, max 50 entries per page.
 * Rate limit: 10 requests per 60 seconds.
 */
export const API_BASE_URL = 'https://api.qoblex.com'
export const DEFAULT_PAGE_SIZE = 50
