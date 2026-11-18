/**
 * Shopee Open Platform API constants.
 *
 * Shopee's API is region-partitioned but all sellers hit the same global
 * partner host. Auth uses HMAC-SHA256 request signing rather than Bearer
 * tokens — every request carries `partner_id`, `timestamp`, `access_token`,
 * `shop_id`, and `sign` as query parameters.
 *
 * Docs: https://open.shopee.com/documents
 */

/** Production API base URL. */
export const BASE_URL = 'https://partner.shopeemobile.com'

/** Sandbox API base URL. */
export const SANDBOX_BASE_URL = 'https://partner.test-stable.shopeemobile.com'

/** API version prefix applied to all resource endpoints. */
export const API_PREFIX = '/api/v2'

/** Default page size for list endpoints. */
export const DEFAULT_PAGE_SIZE = 50

/**
 * Largest `page_size` of every paged list endpoint the adapter uses:
 *   - get_item_list: "the size of one page.Max=100"
 *   - get_return_list, get_wallet_transaction_list, get_discount_list:
 *     "maximum number of entries (<= 100)"
 *   - get_shop_category_list: its page_no and page_size descriptions are
 *     swapped, so it reads as page_size [1, 2147483647] or [1, 100]. 100 is
 *     valid under both.
 */
export const MAX_PAGE_SIZE = 100

/**
 * get_item_base_info's item_id_list is "item_id list; limit [0,50]", so a
 * product page of up to 100 ids is fetched in calls of at most 50.
 */
export const MAX_ITEM_IDS_PER_CALL = 50

/** Token TTL safety buffer — refresh 5 minutes before expiry. */
export const TOKEN_BUFFER_MS = 5 * 60 * 1000

/** Auth endpoints (relative to BASE_URL + API_PREFIX). */
export const AUTH_TOKEN_PATH = '/auth/token/get'
export const AUTH_REFRESH_PATH = '/auth/access_token/get'

/** Resource endpoint paths (relative to API_PREFIX). */
export const PRODUCT_LIST_PATH = '/product/get_item_list'
export const PRODUCT_GET_PATH = '/product/get_item_base_info'
export const PRODUCT_ADD_PATH = '/product/add_item'
export const PRODUCT_UPDATE_PATH = '/product/update_item'
export const PRODUCT_DELETE_PATH = '/product/delete_item'

export const MODEL_LIST_PATH = '/product/get_model_list'
export const MODEL_ADD_PATH = '/product/init_tier_variation'
export const MODEL_UPDATE_PATH = '/product/update_tier_variation'

export const STOCK_UPDATE_PATH = '/product/update_stock'

export const ORDER_LIST_PATH = '/order/get_order_list'
export const ORDER_DETAIL_PATH = '/order/get_order_detail'
export const ORDER_CANCEL_PATH = '/order/cancel_order'

export const LOGISTICS_TRACKING_PATH = '/logistics/get_tracking_number'
export const LOGISTICS_SHIP_PATH = '/logistics/ship_order'
export const LOGISTICS_INFO_PATH = '/logistics/get_shipping_parameter'

export const DISCOUNT_LIST_PATH = '/discount/get_discount_list'
export const DISCOUNT_GET_PATH = '/discount/get_discount'
export const DISCOUNT_ADD_PATH = '/discount/add_discount'
export const DISCOUNT_UPDATE_PATH = '/discount/update_discount'
export const DISCOUNT_DELETE_PATH = '/discount/delete_discount'

export const SHOP_CATEGORY_LIST_PATH = '/shop_category/get_shop_category_list'

export const RETURNS_LIST_PATH = '/returns/get_return_list'
export const RETURNS_DETAIL_PATH = '/returns/get_return_detail'

export const WALLET_TRANSACTION_LIST_PATH = '/payment/get_wallet_transaction_list'
