/**
 * Big Cartel REST API constants.
 *
 * The Big Cartel API is a simple REST API at `https://api.bigcartel.com/v1/`.
 * Authentication is via API key in the Authorization header. Pagination
 * is cursor-based via `page[number]` and `page[size]` query params.
 *
 * Docs: https://developers.bigcartel.com/
 */
export const BASE_URL = 'https://api.bigcartel.com/v1'

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100
