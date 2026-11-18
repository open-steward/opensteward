/**
 * Haravan Omni API constants.
 *
 * Docs: https://docs.haravan.com/docs/omni-apis/
 */

/** Global OAuth host — one partner/Connect app serves every merchant. */
export const AUTH_HOST = 'https://accounts.haravan.com'

/** Global REST API host. Every resource lives under `/com/<resource>.json`. */
export const API_BASE = 'https://apis.haravan.com/com'

/**
 * Every list endpoint we use (products, orders, customers, collections,
 * discounts, inventory adjustments) defaults to 50 rows/page and documents 50
 * as the practical ceiling.
 * https://docs.haravan.com/docs/omni-apis/products/
 */
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 50

/**
 * Leaky-bucket rate limit reported on every response via
 * `X-Haravan-Api-Call-Limit: <used>/<bucket>`. Bucket refills at LEAK_PER_SEC.
 * A 429 carries a `Retry-After` header (seconds).
 * https://docs.haravan.com/docs/omni-apis/api-call-limit/
 */
export const RATE_LIMIT_BUCKET = 80
export const RATE_LIMIT_LEAK_PER_SEC = 4

/**
 * Default OAuth scopes for a full-featured Connect app install.
 *
 * `openid profile email org userinfo grant_service` are the fixed "install"
 * scopes every app must request to complete the OIDC handshake and receive an
 * org-scoped token (https://docs.haravan.com/docs/omni-apis/access-scopes/,
 * https://docs.haravan.com/docs/get-started/create-app/). `wh_api` is
 * required separately to subscribe webhooks
 * (https://docs.haravan.com/docs/tutorials/webhooks/connect-webhook/).
 *
 * `com.write_discounts` is deliberately absent: Haravan's Discount Code docs
 * mark that scope "Only used by the private app"
 * (https://docs.haravan.com/docs/omni-apis/discount/discount-codes/) — a
 * public Connect OAuth app such as this adapter cannot be granted it, so
 * discount writes are not requested and not implemented (see metadata.ts).
 */
export const DEFAULT_SCOPES = [
  'openid',
  'profile',
  'email',
  'org',
  'userinfo',
  'grant_service',
  'wh_api',
  'com.read_products',
  'com.write_products',
  'com.read_orders',
  'com.write_orders',
  'com.read_customers',
  'com.write_customers',
  'com.read_inventories',
  'com.write_inventories',
  'com.read_shop',
  'com.read_discounts',
]
