/**
 * Falabella Seller Center (FSC) API constants.
 *
 * One Action-RPC host serves all three supported business units — the
 * business unit is selected via the `User-Agent` header, not the URL.
 * Argentina is not supported.
 *
 * Docs (verified live 2026-09-13):
 *  - Getting started:   https://developers.falabella.com/docs/getting-started
 *  - Operate with APIs: https://developers.falabella.com/docs/operate-with-apis
 *  - Signing requests:  https://developers.falabella.com/docs/signing-requests
 *  - Products:          https://developers.falabella.com/docs/products/*
 *  - Orders:            https://developers.falabella.com/docs/orders-flow
 *  - Warehouses:        https://developers.falabella.com/docs/orders/getwarehouse
 */

export const API_BASE_URL = 'https://sellercenter-api.falabella.com/'

export const API_VERSION = '1.0'

/** Falabella business unit codes, keyed by the country the seller operates in. */
export const BUSINESS_UNIT_BY_COUNTRY = {
  CL: 'FACL',
  CO: 'FACO',
  PE: 'FAPE',
} as const
export type FalabellaCountry = keyof typeof BUSINESS_UNIT_BY_COUNTRY

/**
 * Falabella is single-currency per business unit — confirmed for order
 * ITEMS via GetOrderItems' own `Currency` field, but GetOrder's order-level
 * totals carry no currency field at all. This is the connection's own
 * configured country, not a platform-wide default.
 */
export const CURRENCY_BY_COUNTRY: Record<FalabellaCountry, string> = {
  CL: 'CLP',
  CO: 'COP',
  PE: 'PEN',
}

export const DEFAULT_PAGE_SIZE = 50
/** GetStock documents a 1000-SKU ceiling per response; GetWarehouse caps Limit at 100. */
export const MAX_STOCK_PAGE_SIZE = 1000
export const MAX_WAREHOUSE_PAGE_SIZE = 100

// ── Actions (docs: https://developers.falabella.com/docs/products/*, /docs/orders/*) ──
export const ACTION_GET_PRODUCTS = 'GetProducts'
export const ACTION_PRODUCT_CREATE = 'ProductCreate'
export const ACTION_PRODUCT_UPDATE = 'ProductUpdate'
export const ACTION_PRODUCT_REMOVE = 'ProductRemove'
export const ACTION_GET_WAREHOUSE = 'GetWarehouse'
export const ACTION_GET_STOCK = 'GetStock'
export const ACTION_UPDATE_STOCK = 'UpdateStock'
export const ACTION_GET_ORDERS = 'GetOrders'
export const ACTION_GET_ORDER = 'GetOrder'
export const ACTION_GET_ORDER_ITEMS = 'GetOrderItems'
export const ACTION_SET_STATUS_READY_TO_SHIP = 'SetStatusToReadyToShip'
export const ACTION_SET_STATUS_CANCELED = 'SetStatusToCanceled'
