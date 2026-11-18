/**
 * TikTok Shop Open API constants.
 *
 * TikTok Shop's API uses HMAC-SHA256 request signing on every request,
 * similar to Shopee. The signature is computed from the request path,
 * query parameters, and body using the app secret as the HMAC key.
 *
 * The API is region-partitioned (SEA, US) but all sellers hit the same
 * global host. Auth uses OAuth2 with HMAC request signing on every call.
 *
 * Docs: https://partner.tiktokshop.com/
 */

/** Production API base URL. */
export const BASE_URL = 'https://open-api.tiktokglobalshop.com'

/** API version prefix applied to all resource endpoints. */
export const API_VERSION = '202309'

/** Default page size for list endpoints. */
export const DEFAULT_PAGE_SIZE = 50

/**
 * Largest `page_size` Search Products, Get Order List, Get Payments and
 * Search Promotion Activities accept ("Valid range: [1-100]"; promotions
 * "[0, 100]").
 */
export const MAX_PAGE_SIZE = 100

/**
 * Search Returns takes `page_size` only in "Valid range: [10-50]", so a
 * caller's page cannot be one upstream page. It is cut from 50-row pages.
 */
export const RETURN_PAGE_SIZE = 50

/** Token TTL safety buffer — refresh 5 minutes before expiry. */
export const TOKEN_BUFFER_MS = 5 * 60 * 1000

/**
 * Token host. The Authorization overview
 * (https://partner.tiktokshop.com/docv2/page/678e3a3292b0f40314a92d75):
 * "Token endpoints (all markets) | `https://auth.tiktok-shops.com/api/v2/token/get`
 * and `.../token/refresh`". Not the API host.
 */
export const AUTH_BASE_URL = 'https://auth.tiktok-shops.com'

/** Auth endpoints. */
export const AUTH_TOKEN_PATH = '/api/v2/token/get'
export const AUTH_REFRESH_PATH = '/api/v2/token/refresh'

/** Product endpoints. */
export const PRODUCT_SEARCH_PATH = '/product/202309/products/search'
export const PRODUCT_GET_PATH = '/product/202309/products'
export const PRODUCT_CREATE_PATH = '/product/202309/products'
export const PRODUCT_UPDATE_PATH = '/product/202309/products'
export const PRODUCT_DELETE_PATH = '/product/202309/products'
export const PRODUCT_ACTIVATE_PATH = '/product/202309/products/activate'
export const PRODUCT_DEACTIVATE_PATH = '/product/202309/products/deactivate'

/** Order endpoints. */
export const ORDER_SEARCH_PATH = '/order/202309/orders/search'
export const ORDER_GET_PATH = '/order/202309/orders'
export const ORDER_CANCEL_PATH = '/order/202309/orders'

/** Fulfillment endpoints. */
export const FULFILLMENT_SEARCH_PATH = '/fulfillment/202309/orders'
export const FULFILLMENT_SHIP_PATH = '/fulfillment/202309/orders'
export const FULFILLMENT_PACKAGES_PATH = '/fulfillment/202309/packages'

/**
 * Products per Search Products page when listing inventory. Inventory Search
 * takes `product_ids` "Max IDs: 100", and Search Products `page_size`
 * "Valid range: [1-100]", so one products page is one inventory request.
 */
export const INVENTORY_PRODUCT_BATCH = 100

/** Inventory endpoints. */
export const INVENTORY_SEARCH_PATH = '/product/202309/inventory/search'
export const INVENTORY_UPDATE_PATH = '/product/202309/inventory/update'

/** Discount (promotion) endpoints. */
export const DISCOUNT_SEARCH_PATH = '/promotion/202309/activities/search'
export const DISCOUNT_GET_PATH = '/promotion/202309/activities'
export const DISCOUNT_CREATE_PATH = '/promotion/202309/activities'
export const DISCOUNT_UPDATE_PATH = '/promotion/202309/activities'
export const DISCOUNT_DELETE_PATH = '/promotion/202309/activities'

/** Logistics / warehouse endpoints. */
export const WAREHOUSE_LIST_PATH = '/logistics/202309/warehouses'

/** Return & Refund endpoints. */
export const RETURN_SEARCH_PATH = '/return_refund/202309/returns/search'

/** Finance endpoints. */
export const FINANCE_PAYMENTS_PATH = '/finance/202309/payments'
export const FINANCE_ORDER_TRANSACTIONS_PATH = '/finance/202309/orders'
