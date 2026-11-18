/**
 * Tokopedia Open API constants.
 *
 * Tokopedia is Indonesia's dominant marketplace (10M+ sellers) with
 * Gojek-integrated logistics. Auth is standard OAuth2 with
 * client_credentials grant for app-level access and authorization_code
 * grant for shop-level access.
 *
 * Base URL: https://fs.tokopedia.net/
 * Docs: https://developer.tokopedia.com/openapi/
 */

/** Production API base URL. */
export const BASE_URL = 'https://fs.tokopedia.net'

/** Auth base URL (separate host). */
export const AUTH_BASE_URL = 'https://accounts.tokopedia.com'

/** Default page size for list endpoints (Tokopedia max is 50). */
export const DEFAULT_PAGE_SIZE = 50

/** Token TTL safety buffer — refresh 5 minutes before expiry. */
export const TOKEN_BUFFER_MS = 5 * 60 * 1000

/** Auth endpoints. */
export const AUTH_TOKEN_PATH = '/token'
export const AUTH_AUTHORIZE_PATH = '/authorize'

/** Product endpoints. */
export const PRODUCT_LIST_PATH = '/inventory/v1/fs/:fs_id/product/info'
export const PRODUCT_GET_PATH = '/inventory/v1/fs/:fs_id/product/info'
export const PRODUCT_CREATE_PATH = '/v2/products/fs/:fs_id/create'
export const PRODUCT_UPDATE_PATH = '/v2/products/fs/:fs_id/edit'
export const PRODUCT_DELETE_PATH = '/v3/products/fs/:fs_id/delete'

/** Order endpoints. */
export const ORDER_LIST_PATH = '/v2/order/list'
export const ORDER_GET_PATH = '/v2/fs/:fs_id/order'

/** Logistics / fulfillment endpoints. */
export const LOGISTICS_CONFIRM_PATH = '/v1/order/:order_id/fs/:fs_id/confirm-shipping'
export const LOGISTICS_STATUS_PATH = '/v1/fs/:fs_id/logistics/shipping-info'

/** Inventory (stock) endpoints. */
export const STOCK_UPDATE_PATH = '/inventory/v1/fs/:fs_id/stock/update'

/** Showcase (collection) endpoints. */
export const SHOWCASE_LIST_PATH = '/v1/showcase/fs/:fs_id/get'
