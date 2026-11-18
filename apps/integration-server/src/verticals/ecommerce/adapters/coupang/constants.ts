/**
 * Coupang WING API constants.
 *
 * Coupang is South Korea's dominant marketplace (~70% ecommerce market share),
 * often called the "Amazon of Korea". The seller API (WING) uses HMAC-SHA256
 * request signing via a custom Authorization header on every request.
 *
 * Every path below is quoted from the reference at
 * https://developers.coupang.com/en/api, except where a comment says otherwise.
 */

/** Production API base URL: every first-party example endpoint uses it. */
export const BASE_URL = 'https://api-gateway.coupang.com'

/** Default page size for list endpoints. */
export const DEFAULT_PAGE_SIZE = 50

/**
 * Default currency for Coupang (Korean Won). Read only by the product
 * transform and its write path, which this rebuild did not touch.
 */
export const DEFAULT_CURRENCY = 'KRW'

/** HMAC algorithm identifier used in the Authorization header. */
export const HMAC_ALGORITHM = 'HmacSHA256'

// ── Product paths ─────────────────────────────────────────────────────────────

export const PRODUCT_LIST_PATH = '/v2/providers/seller_api/apis/api/v1/marketplace/seller-products'
/** Documented maxPerPage ceiling for the seller-product list ("Default: 10, Max.:100"). */
export const PRODUCT_LIST_MAX_PAGE_SIZE = 100
/** GET_PRODUCT_BY_PRODUCT_ID (https://developers.coupang.com/en/api/products/querying-product). */
export const PRODUCT_GET_PATH =
  '/v2/providers/seller_api/apis/api/v1/marketplace/seller-products/:productId'
export const PRODUCT_CREATE_PATH =
  '/v2/providers/seller_api/apis/api/v1/marketplace/seller-products'
export const PRODUCT_DELETE_PATH =
  '/v2/providers/seller_api/apis/api/v1/marketplace/seller-products/:productId'

// ── Order sheet (PO) paths ────────────────────────────────────────────────────

/** GET_ORDERSHEET (https://developers.coupang.com/en/api/shipments/po-list-query-paging-by-day). */
export const ORDERSHEET_LIST_PATH =
  '/v2/providers/openapi/apis/api/v5/vendors/:vendorId/ordersheets'
/** "You can request up to 50 per page." */
export const ORDERSHEET_MAX_PAGE_SIZE = 50
/** "You can query up to 31 days." The error reads "endTime-startTime range should less than31." */
export const ORDERSHEET_MAX_WINDOW_DAYS = 31
/**
 * The documented `status` values, all of them. `status*` is required, so a
 * full list asks for each in turn.
 */
export const ORDERSHEET_STATUSES = [
  'ACCEPT',
  'INSTRUCT',
  'DEPARTURE',
  'DELIVERING',
  'FINAL_DELIVERY',
  'NONE_TRACKING',
] as const
/**
 * GET_ORDERSHEET_BY_SHIPMENTBOX
 * (https://developers.coupang.com/en/api/shipments/single-po-query-using-shipmentboxid).
 */
export const ORDERSHEET_GET_PATH =
  '/v2/providers/openapi/apis/api/v5/vendors/:vendorId/ordersheets/:shipmentBoxId'
/**
 * The date in `createdAtFrom`/`createdAtTo` is "in the form of
 * "yyyy-mm-dd%2B0X:00" 08:00 for Taiwan market. 09:00 for South Korean
 * market." The adapter has no market key, so it uses the South Korean offset.
 */
export const ORDERSHEET_UTC_OFFSET_HOURS = 9

/**
 * Undocumented: this order-item cancel path appears on no first-party page.
 * Only the cancelOrder write method reads it, and writes were out of scope.
 */
export const ORDER_CANCEL_PATH =
  '/v2/providers/seller_api/apis/api/v1/order-items/:orderItemId/cancel'

// ── Inventory paths ───────────────────────────────────────────────────────────

/**
 * GET_PRODUCT_QUANTITY_PRICE_STATUS
 * (https://developers.coupang.com/en/api/products/query-quantitypricestatus-by-product-items).
 */
export const VENDOR_ITEM_INVENTORY_PATH =
  '/v2/providers/seller_api/apis/api/v1/marketplace/vendor-items/:vendorItemId/inventories'
/**
 * Undocumented: `/stock` appears on no first-party page. Only the
 * setInventoryLevel write method reads it, and writes were out of scope.
 */
export const INVENTORY_SET_PATH =
  '/v2/providers/seller_api/apis/api/v1/marketplace/seller-products/:productId/items/:vendorItemId/stock'

// ── Shipping locations ────────────────────────────────────────────────────────

/** OUTBOUND_SHIPPING_PLACE (https://developers.coupang.com/en/api/logistics/query-a-shipping-location). */
export const SHIPPING_PLACE_PATH =
  '/v2/providers/marketplace_openapi/apis/api/v2/vendor/shipping-place/outbound'
/** pageSize: "Default=10, Max=50". */
export const SHIPPING_PLACE_MAX_PAGE_SIZE = 50

// ── Instant-discount coupons ──────────────────────────────────────────────────

/**
 * https://developers.coupang.com/en/api/promotions/instant-discount-coupon-query-a-list-of-coupons-status
 */
export const COUPON_LIST_PATH = '/v2/providers/fms/apis/api/v2/vendors/:vendorId/coupons'
/**
 * https://developers.coupang.com/en/api/promotions/instant-discount-coupon-query-one-coupon-couponid
 */
export const COUPON_GET_PATH = '/v2/providers/fms/apis/api/v2/vendors/:vendorId/coupon'
/** "status* | Coupon status (STANDBY, APPLIED, PAUSED, EXPIRED, DETACHED)". Required. */
export const COUPON_STATUSES = ['STANDBY', 'APPLIED', 'PAUSED', 'EXPIRED', 'DETACHED'] as const
