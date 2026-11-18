/**
 * Gmarket API constants.
 *
 * Gmarket (Korea eBay) exposes a seller REST API for managing products,
 * orders, and fulfillments. Auth is via API key (proprietary header).
 *
 * Base URL: https://api.gmarket.co.kr
 */

/** Gmarket API base URL. */
export const BASE_URL = 'https://api.gmarket.co.kr'

/** Default list page size. */
export const DEFAULT_PAGE_SIZE = 50

/** Maximum page size. */
export const MAX_PAGE_SIZE = 200

/** API paths. */
export const PRODUCTS_BASE = '/v1/products'
export const ORDERS_BASE = '/v1/orders'
export const INVENTORY_BASE = '/v1/inventory'
export const FULFILLMENTS_BASE = '/v1/fulfillments'
