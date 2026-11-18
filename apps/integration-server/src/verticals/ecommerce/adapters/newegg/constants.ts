/**
 * Newegg Marketplace API constants.
 *
 * Newegg uses API key authentication (seller ID + authorization key).
 * The API primarily uses XML for request/response bodies but also
 * supports JSON via Accept/Content-Type headers.
 *
 * Base URL:
 *   https://api.newegg.com/marketplace/
 */

/** Newegg Marketplace API base URL. */
export const BASE_URL = 'https://api.newegg.com/marketplace'

/** Default list page size. */
export const DEFAULT_PAGE_SIZE = 20

/** Maximum page size for most Newegg endpoints. */
export const MAX_PAGE_SIZE = 100

/** Newegg API paths (relative to BASE_URL). */
export const ITEMS_BASE = '/contentmgmt/item'
export const ITEM_INVENTORY_BASE = '/contentmgmt/item/inventory'
export const ORDERS_BASE = '/ordermgmt/order'
export const SHIPMENTS_BASE = '/ordermgmt/order/shipment'

/**
 * Base path per marketplace, appended to BASE_URL
 * (developer.newegg.com → Endpoints and Time Standard).
 */
export const MARKETPLACE_BASE_PATHS = {
  us: '',
  can: '/can',
  b2b: '/b2b',
} as const
export type NeweggMarketplace = keyof typeof MARKETPLACE_BASE_PATHS

/**
 * Required Newegg API header keys. `Authorization` carries the developer API
 * key — NOT the seller ID, which goes in the `sellerid` query parameter.
 */
export const API_KEY_HEADER = 'Authorization'
export const SECRET_KEY_HEADER = 'SecretKey'
export const CONTENT_TYPE = 'application/json'
export const ACCEPT_TYPE = 'application/json'
