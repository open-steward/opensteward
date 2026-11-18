/**
 * Versa Cloud ERP REST API constants.
 *
 * Auth: API token sent as VERSACCOUNTS_AUTHORIZATION header.
 * Base URL: https://www1.versaccounts.com/v1
 * Format: JSON (append .json to resource paths)
 * Pagination: page parameter (1-based) + optional since_id for cursoring
 */
export const API_BASE_URL = 'https://www1.versaccounts.com/v1'
export const DEFAULT_PAGE_SIZE = 100

/** order_type_id values */
export const ORDER_TYPE_PURCHASE = 1
export const ORDER_TYPE_SALES = 2
