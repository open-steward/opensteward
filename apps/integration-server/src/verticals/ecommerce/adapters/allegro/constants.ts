/**
 * Allegro API constants.
 *
 * Allegro is Poland's dominant marketplace. REST API with OAuth2.
 * Two environments: production and sandbox.
 *
 * API groups used:
 *   - Sale Offers (products/offers)
 *   - Order Management (orders, disputes)
 *   - Categories
 */

/** Allegro API base URLs by environment. */
export const ENVIRONMENTS: Record<string, { apiHost: string; authHost: string }> = {
  production: {
    apiHost: 'api.allegro.pl',
    authHost: 'allegro.pl',
  },
  sandbox: {
    apiHost: 'api.allegro.pl.allegrosandbox.pl',
    authHost: 'allegro.pl.allegrosandbox.pl',
  },
}

/** Default environment when a connection doesn't specify one. */
export const DEFAULT_ENVIRONMENT = 'production'

/** Allegro OAuth2 endpoints (production). */
export const OAUTH_AUTHORIZE_URL = 'https://allegro.pl/auth/oauth/authorize'
export const OAUTH_TOKEN_URL = 'https://allegro.pl/auth/oauth/token'

/** Sandbox OAuth2 endpoints. */
export const OAUTH_AUTHORIZE_URL_SANDBOX =
  'https://allegro.pl.allegrosandbox.pl/auth/oauth/authorize'
export const OAUTH_TOKEN_URL_SANDBOX = 'https://allegro.pl.allegrosandbox.pl/auth/oauth/token'

/** Access tokens expire after 12 hours; refresh 5 minutes early. */
export const TOKEN_BUFFER_MS = 5 * 60 * 1000

/** Default list page size. */
export const DEFAULT_PAGE_SIZE = 25

/** Maximum page size for most Allegro endpoints. */
export const MAX_PAGE_SIZE = 1000

/** Documented `limit` maximum of GET /sale/offers. */
export const OFFERS_MAX_LIMIT = 1000
/** Documented `limit` maximum of GET /order/checkout-forms. */
export const ORDERS_MAX_LIMIT = 100
/** Documented `limit` maximum of GET /payments/payment-operations. */
export const PAYMENT_OPERATIONS_MAX_LIMIT = 50
/** Documented `offset` maximum of GET /payments/payment-operations. */
export const PAYMENT_OPERATIONS_MAX_OFFSET = 10000

/** Documented `limit` maximum of GET /payments/refunds. */
export const REFUNDS_MAX_LIMIT = 100
/**
 * Rows asked of GET /sale/loyalty/promotions per request. The spec allows
 * `limit` up to 5000 and `limit + offset` up to 50000 per promotion type.
 */
export const PROMOTIONS_PAGE_SIZE = 1000
/** Documented ceiling on `limit + offset` of GET /sale/loyalty/promotions. */
export const PROMOTIONS_MAX_WINDOW = 50000
/**
 * The documented `promotionType` enum of GET /sale/loyalty/promotions, where
 * "Filtering by promotion type is required." The list walks each in turn.
 */
export const PROMOTION_TYPES = [
  'MULTIPACK',
  'CROSS_MULTIPACK',
  'LARGE_ORDER_DISCOUNT',
  'WHOLESALE_PRICE_LIST',
] as const

/** Allegro API paths. */
export const OFFERS_BASE = '/sale/offers'
export const OFFER_PRODUCT_BASE = '/sale/product-offers'
export const ORDERS_BASE = '/order/checkout-forms'
/** Used only by createRefund (a write method left unchanged); absent from the spec. */
export const DISPUTES_BASE = '/sale/disputes'
export const REFUNDS_BASE = '/payments/refunds'
export const ME_PATH = '/me'
export const CATEGORIES_BASE = '/sale/categories'
export const SHIPMENTS_BASE = '/order/checkout-forms'
export const PAYMENTS_BASE = '/payments/payment-operations'
export const POINTS_OF_SERVICE_BASE = '/points-of-service'
export const LOYALTY_PROMOTIONS_BASE = '/sale/loyalty/promotions'
