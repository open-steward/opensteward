/**
 * Dukaan Public API constants.
 *
 * Docs (Dukaan's published Postman collection, "Dukaan Public APIs"):
 *   https://documenter.getpostman.com/view/25389466/2s9Yynk3f7
 *   raw: https://documenter.gw.postman.com/api/collections/25389466/2s9Yynk3f7?segregateAuth=true&versionTag=latest
 *
 * Every request in the collection is on `https://api.mydukaan.io`, e.g.
 *   "https://api.mydukaan.io/api/product/seller/product-category/?page=1&page_size=30&v2=true"
 * and the "Important Keys" table gives the auth header as
 *   "authorization | Bearer {store_authentication_token}".
 */

export const BASE_URL = 'https://api.mydukaan.io'

/**
 * product_list Query Params table: "page_size | 1-99 ( max 99 results allowed
 * per page )". The only page-size ceiling the collection documents.
 */
export const PRODUCT_MAX_PAGE_SIZE = 99

/**
 * The page size every documented list request in the collection sends
 * (`page_size=30`), used only when a direct call names no limit.
 */
export const DEFAULT_PAGE_SIZE = 30
