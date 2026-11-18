/**
 * SendOwl REST API constants.
 *
 * Docs: https://dashboard.sendowl.com/developers/api/introduction
 *
 * SendOwl versions endpoints per-resource rather than globally — products
 * are `/api/v1/...`, discounts `/api/v1_2/...`, orders `/api/v1_3/...`, and
 * the refund action lives at the unversioned `/api/v1/orders/{id}/refund`
 * path documented on the orders reference page.
 */
export const API_HOST = 'https://api.sendowl.com'

/** Products, and the unversioned order-refund action, live at `/api/v1`. */
export const V1_BASE = '/api/v1'
export const DISCOUNTS_BASE = '/api/v1_2'
export const ORDERS_BASE = '/api/v1_3'

/**
 * Pagination: `page` (default 1, 1-indexed) + `per_page` (documented default
 * 10, max 50). https://dashboard.sendowl.com/developers/api/introduction
 */
export const DEFAULT_PAGE_SIZE = 10
export const MAX_PAGE_SIZE = 50
