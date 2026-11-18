/**
 * Quickbutik REST API v1 constants.
 *
 * Base URL: https://api.quickbutik.com/v1
 * Auth: HTTP Basic using `api_key:api_key` (same key for username and password).
 *
 * Pagination uses offset/limit:
 *  - products: default 100, max 500
 *  - orders:   default 1000, max 1000
 */

export const API_BASE_URL = 'https://api.quickbutik.com/v1'

export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE_PRODUCTS = 500
export const MAX_PAGE_SIZE_ORDERS = 1000
