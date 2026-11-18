/**
 * ColorMe Shop (カラーミーショップ) API constants.
 *
 * Docs: OpenAPI spec at https://api.shop-pro.jp/v1/spec/open_api.json
 * (`info.description`, fetched and parsed directly — not a page summary).
 */

export const AUTH_HOST = 'https://api.shop-pro.jp'
export const API_BASE = 'https://api.shop-pro.jp/v1'

/**
 * `limit` defaults to 10 and caps at 50 for products/stocks/variants, 100 for
 * sales/customers (confirmed per-endpoint in the OpenAPI spec). A single
 * conservative ceiling — the lowest of the two — keeps `capabilities.maxPageSize`
 * (one value for the whole adapter) safe everywhere, at the cost of not using
 * sales/customers' full 100-row capacity.
 */
export const DEFAULT_PAGE_SIZE = 10
export const MAX_PAGE_SIZE = 50

/** The exact 8 scopes declared against real operations in the OpenAPI spec. */
export const DEFAULT_SCOPES = [
  'read_products',
  'write_products',
  'read_sales',
  'write_sales',
  'read_shop_coupons',
  'write_shop_coupons',
  'read_templates',
  'write_templates',
]
