/**
 * Temu Open Platform API constants.
 *
 * The Temu Open Platform uses a single POST endpoint (`/openapi/router`) on
 * region-specific base hosts. The API method is selected via the `type` body
 * parameter rather than a URL path.
 *
 * Docs: https://partner.temu.com/documentation
 */

/**
 * Region-specific base URLs, from the "Endpoints and Request Method" guide:
 * "If the Temu store is located in the US, please use the US host, else if the
 * store is located in the EU, please use the EU request host".
 * US sellers  → openapi-b-us.temu.com
 * EU sellers  → openapi-b-eu.temu.com
 * Global (MX/JP/etc.) → openapi-b-global.temu.com
 *
 * The adapter defaults to the US endpoint; callers may override via
 * `TemuAdapterConfig.baseUrl`.
 */
export const BASE_URL_US = 'https://openapi-b-us.temu.com/openapi/router'
export const BASE_URL_EU = 'https://openapi-b-eu.temu.com/openapi/router'
export const BASE_URL_GLOBAL = 'https://openapi-b-global.temu.com/openapi/router'

/** Default base URL (US region). Override via config for EU/Global sellers. */
export const DEFAULT_BASE_URL = BASE_URL_US

/** Common parameter `data_type`: "the optional parameters are fixed as JSON". */
export const DATA_TYPE = 'JSON'

/** `bg.local.goods.list.query` pageSize: "with a limit of 100 per page". */
export const GOODS_PAGE_MAX = 100

/** `bg.order.list.v2.get` pageSize: "default is 10, max is 100." */
export const ORDER_PAGE_MAX = 100

/** `bg.aftersales.parentaftersales.list.get` pageSize: "default is 10, max is 200." */
export const AFTERSALES_PAGE_MAX = 200

/**
 * `bg.local.goods.list.query` goodsStatusFilterType values: "#1# -
 * Available/off the shelf | #4# - Not yet published | #5# - Draft | #6# -
 * Deleted". The endpoint needs one of goodsSearchType, goodsStatusFilterType
 * or goodsIdList, so the catalog is walked one status at a time. Deleted
 * goods (6) are not part of the catalog.
 */
export const GOODS_STATUS_BUCKETS = [1, 4, 5] as const

/** `bg.aftersales.parentaftersales.list.get` afterSalesStatusGroup "5: Refunded". */
export const AFTERSALES_REFUNDED_GROUP = 5
