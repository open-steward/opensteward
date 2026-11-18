/**
 * Alibaba.com Open Platform constants.
 *
 * Every value here comes from the first-party docs at openapi.alibaba.com,
 * whose pages are rendered from JSON served by
 * /handler/share/doc/getDocDetail.json?docId=… (guides) and
 * /handler/share/apidoc/getApi.json?cid=…&path=…&methodType=GET/POST (APIs).
 */

/**
 * The REST gateway. docId=61 ("HTTP request sample"): "The splicing method is:
 * https://openapi-api.alibaba.com/rest/ {api_path}?{query}". The API is
 * selected by its path (e.g. `/alibaba/icbu/product/list`), not by a `method`
 * parameter.
 */
export const ALIBABA_REST_BASE = 'https://openapi-api.alibaba.com/rest'

/**
 * docId=56 ("Seller authorization introduction"): "Sample link for
 * authorization: https://openapi-auth.alibaba.com/oauth/authorize?
 * response_type=code&redirect_uri=${app call back url}&client_id=${appkey}".
 */
export const AUTH_URL_BASE = 'https://openapi-auth.alibaba.com/oauth/authorize'

/**
 * docId=60 / docId=61: "sign_method = \"sha256\"", the digest being
 * HMAC_SHA256 keyed by the App Secret.
 */
export const SIGN_METHOD = 'sha256'

/** Platform identifier reported to clients. */
export const PLATFORM_SLUG = 'alibaba'

// ── API paths ────────────────────────────────────────────────────────────────

/** System API "GenerateAccessToken" (cid=4). */
export const PATH_TOKEN_CREATE = '/auth/token/create'
/** System API "RefreshAccessToken" (cid=4). */
export const PATH_TOKEN_REFRESH = '/auth/token/refresh'

/** alibaba.icbu.product.list (cid=1). */
export const PATH_PRODUCT_LIST = '/alibaba/icbu/product/list'
/** "Get Product Information" (cid=11): "get the product information by product id or sku id". */
export const PATH_PRODUCT_GET = '/alibaba/icbu/product/get/v2'
/** alibaba.icbu.product.inventory.get (cid=1): "Get product inventory information". */
export const PATH_INVENTORY_GET = '/icbu/product/inventory/get'
/** "Get Category Information" (cid=11). */
export const PATH_CATEGORY_LIST = '/alibaba/icbu/category/get/v2'
/** alibaba.icbu.category.get.new (cid=1). */
export const PATH_CATEGORY_GET = '/icbu/product/category/get'
/** "alibaba order list" (cid=8). */
export const PATH_ORDER_LIST = '/alibaba/order/list'
/** "alibaba order get" (cid=8). */
export const PATH_ORDER_GET = '/alibaba/order/get'
/** "order logistics info query api" (cid=8). */
export const PATH_LOGISTICS_QUERY = '/order/logistics/query'

// ── Page sizes ───────────────────────────────────────────────────────────────

/**
 * alibaba.icbu.product.list: "Pagination is supported, with a maximum of 30
 * per page."
 */
export const PRODUCT_LIST_MAX_PAGE_SIZE = 30

/**
 * /alibaba/order/list `page_size`: "Default Value:10,The maximum number of
 * pages is 100."
 */
export const ORDER_LIST_MAX_PAGE_SIZE = 100

/**
 * /alibaba/order/list `page_size` "Default Value:10". Used for the parent
 * order pages that fulfillments are flattened out of, each order costing one
 * /order/logistics/query call.
 */
export const ORDER_LIST_DEFAULT_PAGE_SIZE = 10

/**
 * /alibaba/order/list `role`: "seller/buyer， default buyer". An adapter
 * connected with a seller's authorization lists that seller's orders.
 */
export const ORDER_ROLE = 'seller'

/**
 * /icbu/product/inventory/get `language` is required; its documented request
 * sample sends `request.addApiParameter("language", "en_US")`.
 */
export const INVENTORY_LANGUAGE = 'en_US'

// ── Default location ─────────────────────────────────────────────────────────

/** Synthetic location id used by the (unchanged) location transform. */
export const DEFAULT_LOCATION_ID = 'alibaba-default'
