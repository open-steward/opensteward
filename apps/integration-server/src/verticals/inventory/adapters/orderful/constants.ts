/**
 * Orderful EDI API constants.
 *
 * Auth: API key passed as the `orderful-api-key` request header.
 * Base URL: https://api.orderful.com
 * Primary API version: v3
 *
 * Docs: https://docs.orderful.com/reference/overview
 */
export const API_BASE_URL = 'https://api.orderful.com'
export const API_VERSION = 'v3'
export const DEFAULT_PAGE_SIZE = 100
/**
 * Largest `limit` GET /v3/relationships takes (schema maximum 100). GET
 * /v3/transactions takes no size at all: "A maximum of 100 Transactions will
 * be returned at a time."
 */
export const MAX_PAGE_SIZE = 100
