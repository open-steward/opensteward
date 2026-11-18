/**
 * Tmall / Taobao Open Platform (TOP) API constants.
 *
 * Both Tmall (B2C brand marketplace) and Taobao (C2C marketplace) use the
 * same Taobao Open Platform (TOP) API. All requests are HTTP POST to a single
 * endpoint; the `method` param selects the API operation.
 *
 * Tmall targets brands and large sellers; this adapter covers the Tmall
 * Seller API surface which is a superset of the core TOP methods.
 */

/** The single TOP router endpoint. All API calls POST here. */
export const TOP_ENDPOINT = 'https://eco.taobao.com/router/rest'

/** TOP API version. */
export const API_VERSION = '2.0'

/** Sign method — TOP uses MD5. */
export const SIGN_METHOD = 'md5'

/** Response format. */
export const RESPONSE_FORMAT = 'json'

/** Platform identifier reported to clients. */
export const PLATFORM_SLUG = 'tmall'

/** Default page size for list endpoints. */
export const DEFAULT_PAGE_SIZE = 20

/** Maximum page size for TOP APIs. */
export const MAX_PAGE_SIZE = 100

/**
 * Access tokens expire in ~7 days; refresh tokens ~30 days.
 * Refresh 1 hour early to avoid expiry races.
 */
export const TOKEN_BUFFER_MS = 60 * 60 * 1000

// ── TOP API method names ─────────────────────────────────────────────────────

/**
 * List the session seller's on-sale items (products): 获取当前会话用户出售中的商品列表
 * (https://open.taobao.com/api.htm?docId=18&docType=2). Pages by `page_no` /
 * `page_size` ("每页条数。取值范围:大于零的整数;最大值：200；默认值：40。") and
 * answers `total_results` ("搜索到符合条件的结果总数").
 */
export const METHOD_ITEM_LIST = 'taobao.items.onsale.get'

/** Get a single item (product) by num_iid. */
export const METHOD_ITEM_GET = 'taobao.item.get'

/** Update an item (product). */
export const METHOD_ITEM_UPDATE = 'taobao.item.update'

/** List sold trades (orders). */
export const METHOD_TRADES_LIST = 'taobao.trades.sold.get'

/** Get full order details. */
export const METHOD_TRADE_GET = 'taobao.trade.fullinfo.get'

/** Close a trade (cancel order). */
export const METHOD_TRADE_CLOSE = 'taobao.trade.close'

/**
 * List logistics orders (fulfillments): 批量查询物流订单
 * (https://open.taobao.com/api.htm?docId=235&docType=2). Pages by `page_no`
 * ("页码.该字段没传 或 值<1 ,则默认page_no为1") and `page_size` ("每页条数.该字段没传
 * 或 值<1 ,则默认page_size为40", no documented maximum) and answers
 * `total_results` ("搜索到的物流订单列表总数"). Also the only documented read of one
 * trade's logistics orders, by `tid`.
 */
export const METHOD_LOGISTICS_LIST = 'taobao.logistics.orders.get'

/** List refunds received by the seller. */
export const METHOD_REFUNDS_LIST = 'taobao.refunds.receive.get'

/** Get a single refund by refund_id. */
export const METHOD_REFUND_GET = 'taobao.refund.get'

/** Get trade payment/amount details (used as transaction source). */
export const METHOD_TRADE_AMOUNT_GET = 'taobao.trade.amount.get'

/**
 * List SKUs (variants) for up to 40 products in one call. There is no
 * unscoped variant list — `num_iids` (comma-separated product ids) is
 * required.
 */
export const METHOD_ITEM_SKUS_GET = 'taobao.item.skus.get'

/**
 * Get a single SKU (variant) by `sku_id`. TOP requires `sku_id` plus one of
 * `num_iid` or `nick` to disambiguate which seller's item the SKU belongs to.
 */
export const METHOD_ITEM_SKU_GET = 'taobao.item.sku.get'

/** `taobao.item.skus.get` rejects more than this many `num_iids` per call. */
export const MAX_SKU_PRODUCT_IDS = 40

// ── Field sets ───────────────────────────────────────────────────────────────

/**
 * Fields requested for trade list / full info responses.
 * TOP requires explicit field selection for many methods.
 */
export const TRADE_FIELDS =
  'tid,status,type,buyer_nick,buyer_email,receiver_name,receiver_phone,receiver_mobile,' +
  'receiver_state,receiver_city,receiver_district,receiver_address,receiver_zip,' +
  'payment,post_fee,discount_fee,orders,created,modified,end_time,pay_time'

/** Fields for item list responses. */
export const ITEM_FIELDS =
  'num_iid,title,desc,price,approve_status,modified,created,sku,pic_url,detail_url,type,item_imgs'

/** Fields for refund list / single refund responses. */
export const REFUND_FIELDS =
  'refund_id,tid,oid,buyer_nick,seller_nick,total_fee,refund_fee,alipay_no,status,' +
  'reason,desc,has_good_return,title,num_iid,num,created,modified,good_return_time,company_name,sid'

/** Fields for trade amount (transaction) responses. */
export const TRADE_AMOUNT_FIELDS =
  'tid,alipay_no,created,pay_time,end_time,total_fee,payment,post_fee,commission_fee'

/** Fields for SKU (variant) responses — `taobao.item.skus.get` / `.sku.get`. */
export const SKU_FIELDS =
  'sku_id,num_iid,properties,properties_name,quantity,price,outer_id,created,modified,status'
