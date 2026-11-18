/**
 * Pinduoduo Open Platform API constants.
 *
 * Pinduoduo (group-buying marketplace, 900M+ users) and its international
 * expansion Temu share the same Open Platform API. All requests are HTTP
 * POST to a single router endpoint; the `type` param selects the API method.
 *
 * Signing algorithm (MD5):
 *   1. Sort all params alphabetically by key (excluding `sign` itself)
 *   2. Concatenate: clientSecret + key1value1key2value2... + clientSecret
 *   3. sign = MD5(concat).toUpperCase()
 */

/** The single PDD Open Platform router endpoint. All API calls POST here. */
export const PDD_ENDPOINT = 'https://open-api.pinduoduo.com/api/router'

/** PDD API version. */
export const API_VERSION = 'V1'

/** Response format. */
export const RESPONSE_FORMAT = 'JSON'

/** Platform identifier reported to clients. */
export const PLATFORM_SLUG = 'pinduoduo'

/** Default page size for list endpoints. */
export const DEFAULT_PAGE_SIZE = 20

/** Maximum page size for PDD APIs. */
export const MAX_PAGE_SIZE = 100

// ── API method names ──────────────────────────────────────────────────────────

/** List goods (products). */
export const METHOD_GOODS_LIST = 'pdd.goods.list.get'

/** Get goods detail. */
export const METHOD_GOODS_GET = 'pdd.goods.detail.get'

/** Create a new goods listing. */
export const METHOD_GOODS_CREATE = 'pdd.goods.commit.create'

/** Update an existing goods listing. */
export const METHOD_GOODS_UPDATE = 'pdd.goods.commit.update'

/** List orders. */
export const METHOD_ORDER_LIST = 'pdd.order.list.get'

/** Get a single order's details. */
export const METHOD_ORDER_GET = 'pdd.order.information.get'

/** Get order status. */
export const METHOD_ORDER_STATUS = 'pdd.order.status.get'

/** Query SKU stock levels. */
export const METHOD_SKU_STOCK_QUERY = 'pdd.goods.sku.stock.query'

/** Update SKU stock level. */
export const METHOD_SKU_STOCK_UPDATE = 'pdd.goods.sku.stock.update'

/** List logistics packages (fulfillments). */
export const METHOD_PACKAGE_LIST = 'pdd.logistics.package.list.get'

/**
 * List after-sales (refund) records updated within a time window.
 * Incremental feed: bounded by `start_updated_at`/`end_updated_at`, not a
 * page cursor over full history.
 */
export const METHOD_REFUND_LIST = 'pdd.refund.list.increment.get'

/** Get a single after-sales (refund) record's details. */
export const METHOD_REFUND_GET = 'pdd.refund.information.get'

/**
 * Max width, in seconds, of the `start_updated_at`/`end_updated_at` window
 * accepted by `pdd.refund.list.increment.get`. PDD's other `*.increment.get`
 * methods cap this span; ~30 minutes is the figure on record for this family,
 * but per-method field docs for this endpoint returned only "System Error" at
 * verification time — treat as best-effort, not confirmed against a live
 * tenant (see pinduoduo/index.ts Refunds section).
 */
export const REFUND_LIST_WINDOW_SECONDS = 30 * 60

// ── PDD order status values ───────────────────────────────────────────────────

/**
 * PDD order status codes:
 *   1  = WAIT_PAY (awaiting payment)
 *   2  = WAIT_DELIVERY (paid, waiting for shipment)
 *   3  = WAIT_CONFIRM (shipped, awaiting buyer confirmation)
 *   4  = FINISHED (completed / confirmed by buyer or auto-confirmed)
 *   5  = CANCELLED (cancelled)
 *   6  = REFUNDING (refund in progress)
 *   7  = COMPLETED (historically completed)
 */
export const ORDER_STATUS_WAIT_PAY = 1
export const ORDER_STATUS_WAIT_DELIVERY = 2
export const ORDER_STATUS_WAIT_CONFIRM = 3
export const ORDER_STATUS_FINISHED = 4
export const ORDER_STATUS_CANCELLED = 5
export const ORDER_STATUS_REFUNDING = 6
export const ORDER_STATUS_COMPLETED = 7

// ── PDD goods status values ───────────────────────────────────────────────────

/**
 * PDD goods (product) on-sale flag:
 *   is_onsale = 1 → goods are currently listed for sale
 *   is_onsale = 0 → goods are off-shelf / draft
 *
 * goods_status (when returned):
 *   1 = listed
 *   0 = unlisted / draft
 *  -1 = deleted
 */
export const GOODS_STATUS_LISTED = 1
export const GOODS_STATUS_UNLISTED = 0
export const GOODS_STATUS_DELETED = -1
