/**
 * ClearFeed REST API constants.
 *
 * Base URL: https://api.clearfeed.app/v1/rest
 * Auth: Bearer token (Authorization: Bearer <token>)
 * Pagination: cursor-based via next_cursor / limit query parameters.
 */
export const API_BASE_URL = 'https://api.clearfeed.app/v1/rest'
export const DEFAULT_PAGE_SIZE = 50
/** Get Requests / Get All Customers: `limit` "(1-100), defaulting to 50". */
export const MAX_PAGE_SIZE = 100
