/**
 * Octopia Seller API constants. Cdiscount Marketplace is operated by
 * Octopia — the legacy `dev.cdiscount.com` SOAP API is retired; the current
 * REST surface lives at developer.octopia-io.net.
 *
 * Docs (verified live 2026-09-13):
 *  - Landing:        https://developer.octopia-io.net/
 *  - Credentials:    https://developer.octopia-io.net/user-guides/api-credentials/
 *  - Products:       https://developer.octopia-io.net/api-reference/product-management/
 *  - Offers:         https://developer.octopia-io.net/api-reference/offer-management/
 *  - Offer write:    https://developer.octopia-io.net/api-reference/offer-management/offer-management-json/
 *  - Orders:         https://developer.octopia-io.net/api-reference/orders-management/
 */

export const TOKEN_ENDPOINT =
  'https://auth.octopia-io.net/auth/realms/maas/protocol/openid-connect/token'

export const API_BASE_URL = 'https://api.octopia-io.net/seller/v2/'

/**
 * Octopia access tokens live 2h (7200s) and the token endpoint is rate
 * limited to 500 calls/hour — minting one per request would both blow the
 * limit almost immediately (500 requests/run) and be unnecessary. Refresh 5
 * minutes early so a long-running request never races an expiring token.
 */
export const TOKEN_LIFETIME_SECONDS = 7200 - 300

export const DEFAULT_PAGE_SIZE = 50
/** `/products` and `/offers` cap `limit` at 100 and 1000 respectively. */
export const MAX_PRODUCT_PAGE_SIZE = 100
export const MAX_OFFER_PAGE_SIZE = 1000
/** `/orders` uses pageIndex/pageSize (1-indexed), max pageSize 100. */
export const MAX_ORDER_PAGE_SIZE = 100
export const DEFAULT_ORDER_PAGE_SIZE = 50

/**
 * `GET /seller/v2/offers` requires a `salesChannelId` (a seller can sell on
 * several Octopia-network storefronts, e.g. `CDISFR`, `SELLZZ`). This
 * adapter is scoped to Cdiscount Marketplace, so it defaults to Cdiscount's
 * France channel; sellers on a different Octopia storefront can override via
 * the optional `salesChannelId` credential field.
 */
export const DEFAULT_SALES_CHANNEL_ID = 'CDISFR'
