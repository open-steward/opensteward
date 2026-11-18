/**
 * eBay API constants.
 *
 * eBay's REST APIs are split across multiple "API groups" (Sell, Buy,
 * Commerce, etc.). This adapter uses:
 *   - Sell Inventory API (products, locations, inventory)
 *   - Sell Fulfillment API (orders, fulfillments, refunds)
 *   - Sell Finances API (transactions)
 *
 * Two environments: production and sandbox.
 */

/** eBay API base URLs by environment. */
export const ENVIRONMENTS: Record<string, { apiHost: string }> = {
  production: { apiHost: 'api.ebay.com' },
  sandbox: { apiHost: 'api.sandbox.ebay.com' },
}

/** Default environment when a connection doesn't specify one. */
export const DEFAULT_ENVIRONMENT = 'production'

/** eBay OAuth2 endpoints. */
export const OAUTH_AUTHORIZE_URL = 'https://auth.ebay.com/oauth2/authorize'
export const OAUTH_TOKEN_URL = 'https://api.ebay.com/identity/v1/oauth2/token'
export const OAUTH_TOKEN_URL_SANDBOX = 'https://api.sandbox.ebay.com/identity/v1/oauth2/token'

/** Access tokens expire after 2 hours; refresh 5 minutes early. */
export const TOKEN_BUFFER_MS = 5 * 60 * 1000

/** Default list page size. */
export const DEFAULT_PAGE_SIZE = 25

/** Maximum page size for most eBay endpoints. */
export const MAX_PAGE_SIZE = 200

/** eBay API paths. */
export const INVENTORY_BASE = '/sell/inventory/v1/inventory_item'
/**
 * Inventory item GROUPS — the parent "product with options" that ties
 * several SKUs (`inventory_item`s) together as variants. There is no
 * unscoped list endpoint; only get/put/delete by key.
 */
export const INVENTORY_ITEM_GROUP_BASE = '/sell/inventory/v1/inventory_item_group'
export const LOCATION_BASE = '/sell/inventory/v1/location'
export const ORDER_BASE = '/sell/fulfillment/v1/order'
export const FINANCES_BASE = '/sell/finances/v1/transaction'
export const MARKETING_PROMOTION_BASE = '/sell/marketing/v1/promotion'
export const MARKETING_ITEM_PROMOTION_BASE = '/sell/marketing/v1/item_promotion'
