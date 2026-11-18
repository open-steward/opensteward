/**
 * JD.com Open Platform API constants.
 *
 * JD uses a **gateway pattern**: all API requests hit a single URL
 * (`https://api.jd.com/routerjson`) with a `method` parameter that
 * selects the endpoint (e.g. `method=jingdong.sku.read`).
 *
 * Request signing: every request is signed with HMAC-MD5 of the sorted
 * parameter string using the app secret.
 *
 * Docs: https://jos.jd.com/
 */

/** Production gateway URL — all API requests go here. */
export const GATEWAY_URL = 'https://api.jd.com/routerjson'

/** Sandbox gateway URL. */
export const SANDBOX_GATEWAY_URL = 'https://api.jd.com/sandbox/routerjson'

/** OAuth2 authorization URL. */
export const AUTH_URL = 'https://oauth.jd.com/oauth/authorize'

/** OAuth2 token endpoint. */
export const TOKEN_URL = 'https://oauth.jd.com/oauth/token'

/** Default page size for list endpoints. */
export const DEFAULT_PAGE_SIZE = 50

/** jingdong.asc.serviceAndRefund.view pageSize: "每页大小（1-50，默认10）" (1-50, default 10). */
export const MAX_REFUND_PAGE_SIZE = 50

/**
 * jingdong.asc.serviceAndRefund.view applyTimeBegin:
 * "开始时间与结束时间的时间差不能超过7天" (begin and end at most 7 days apart;
 * error 10310 "服务单查询申请时间间隔不得大于7天").
 */
export const MAX_REFUND_WINDOW_DAYS = 7

/** Token TTL safety buffer — refresh 5 minutes before expiry. */
export const TOKEN_BUFFER_MS = 5 * 60 * 1000

// ── API method names ──────────────────────────────────────────────────────────

/** Product / SKU methods */
export const METHOD_SKU_LIST = 'jingdong.sku.list'
export const METHOD_SKU_READ = 'jingdong.sku.read'
export const METHOD_SKU_CREATE = 'jingdong.sku.create'
export const METHOD_SKU_UPDATE = 'jingdong.sku.update'
export const METHOD_SKU_DELETE = 'jingdong.sku.delete'

/** Variant methods (SKU attributes / multi-SKU) */
export const METHOD_SKU_ATTRS_READ = 'jingdong.sku.attrs.read'

/** Inventory methods */
export const METHOD_STOCK_READ = 'jingdong.stock.read'
export const METHOD_STOCK_UPDATE = 'jingdong.stock.update'

/** Order methods */
export const METHOD_ORDER_LIST = 'jingdong.order.search'
export const METHOD_ORDER_READ = 'jingdong.order.read'
export const METHOD_ORDER_CANCEL = 'jingdong.order.cancel'

/** Fulfillment / logistics methods */
export const METHOD_LOGISTICS_TRACE = 'jingdong.logistics.trace.get'
export const METHOD_LOGISTICS_SHIP = 'jingdong.logistics.ship'

/** After-sales / refund methods (ASC = After-Sales Center) */
export const METHOD_REFUND_LIST = 'jingdong.asc.serviceAndRefund.view'

/** Seller promotion / discount methods */
export const METHOD_PROMOTION_LIST = 'jingdong.seller.promotion.v2.list'
export const METHOD_PROMOTION_GET = 'jingdong.seller.promotion.v2.get'
