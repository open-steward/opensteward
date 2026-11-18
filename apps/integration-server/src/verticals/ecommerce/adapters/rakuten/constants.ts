/**
 * Rakuten Ichiba / RMS (Rakuten Merchant Server) API constants.
 *
 * Rakuten operates two API layers:
 *
 *   1. **Rakuten Ichiba Item Search API** — Public catalog search using
 *      applicationId as a query parameter. Useful for product lookup by
 *      keyword. Base: https://app.rakuten.co.jp/services/api
 *
 *   2. **RMS (Rakuten Merchant Server) Web API** — Licensed seller API for
 *      managing inventory, orders, and items. Requires a serviceSecret +
 *      licenseKey combo encoded in the Authorization header.
 *      Base: https://api.rms.rakuten.co.jp/es/2.0
 *
 * Auth model:
 *   - `credentials.accessToken`        = applicationId (public API key)
 *   - `credentials.extra.licenseKey`   = RMS license key
 *   - `credentials.extra.serviceSecret`= RMS service secret
 *
 * The RMS Authorization header is:
 *   `ESA ${base64(serviceSecret + ":" + licenseKey)}`
 *
 * Docs:
 *   - RMS: https://webservice.rms.rakuten.co.jp/merchant-portal/view?contents=/en/web-service/api-list
 *   - Item Search: https://webservice.rakuten.co.jp/documentation/ichiba-item-search
 */

/** RMS API base URL */
export const RMS_BASE_URL = 'https://api.rms.rakuten.co.jp/es/2.0'

/** Public Ichiba API base URL */
export const ICHIBA_BASE_URL = 'https://app.rakuten.co.jp/services/api'

/** Default page size for list endpoints. */
export const DEFAULT_PAGE_SIZE = 50

/** Synthetic location id — Rakuten manages warehouses internally. */
export const DEFAULT_LOCATION_ID = 'rakuten-default'

/** RMS API endpoint paths (relative to RMS_BASE_URL) */
export const ITEM_LIST_PATH = '/item/'
export const ITEM_GET_PATH = '/item/' // + {itemUrl}
export const ITEM_CREATE_PATH = '/item/'
export const ITEM_UPDATE_PATH = '/item/' // + {itemUrl}
export const ITEM_DELETE_PATH = '/item/' // + {itemUrl}

export const ORDER_LIST_PATH = '/order/'
export const ORDER_GET_PATH = '/order/' // + {orderNumber}
export const ORDER_CANCEL_PATH = '/order/' // + {orderNumber}/cancel

export const INVENTORY_LIST_PATH = '/inventory/'
export const INVENTORY_GET_PATH = '/inventory/' // + {itemUrl}

/**
 * CategoryAPI 2.0 paths.
 * Base URL for these is https://api.rms.rakuten.co.jp/es/2.0 (same RMS base).
 */
export const CATEGORY_LIST_PATH = '/categories/shop-categories/category-ids/'
export const CATEGORY_SET_LIST_PATH = '/categories/shop-category-set-lists'

/**
 * CouponAPI paths.
 * Note: CouponAPI uses version 1.0 of the RMS API endpoint scheme.
 */
export const COUPON_GET_PATH = '/coupon/get'
export const COUPON_SEARCH_PATH = '/coupon/search'

/** Ichiba Item Search path (public) */
export const ICHIBA_ITEM_SEARCH_PATH = '/IchibaItem/Search/20170706'

/** Rakuten currency — Ichiba is JPY-native */
export const DEFAULT_CURRENCY = 'JPY'
