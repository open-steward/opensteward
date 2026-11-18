/**
 * Lazada Open Platform API constants.
 *
 * Lazada is an Alibaba-owned Southeast Asian marketplace with country-specific
 * TLDs. The adapter stores the country code (e.g. `sg`, `my`, `th`) in
 * `credentials.extra.country` and resolves the correct base URL at runtime.
 */

/** Country TLD mapping. Stored in `credentials.extra.country`. */
export const COUNTRY_TLDS: Record<string, string> = {
  sg: 'sg',
  my: 'com.my',
  th: 'co.th',
  ph: 'com.ph',
  vn: 'vn',
  id: 'co.id',
}

/** Resolve the API base URL for a given country code. */
export function resolveBaseUrl(country: string): string {
  const tld = COUNTRY_TLDS[country]
  if (!tld) {
    throw new Error(
      `Lazada adapter: unknown country '${country}'. Valid: ${Object.keys(COUNTRY_TLDS).join(', ')}.`,
    )
  }
  return `https://api.lazada.${tld}/rest`
}

/** Lazada auth token endpoint (country-agnostic). */
export const TOKEN_ENDPOINT = 'https://auth.lazada.com/rest/token/create'

/** Authorization URL base for the OAuth2 flow. */
export const AUTH_URL_BASE = 'https://auth.lazada.com/oauth/authorize'

/** Default page size for list endpoints. */
export const DEFAULT_PAGE_SIZE = 20

/** Maximum page size allowed by Lazada. */
export const MAX_PAGE_SIZE = 100

/** Access tokens expire in ~7 days; refresh 1 hour early. */
export const TOKEN_BUFFER_MS = 60 * 60 * 1000

/** Platform identifier reported to clients. */
export const PLATFORM_SLUG = 'lazada'

// ── API Paths ───────────────────────────────────────────────────────────────

export const PRODUCTS_LIST = '/products/get'
export const PRODUCT_GET = '/product/item/get'
export const PRODUCT_CREATE = '/product/create'
export const PRODUCT_UPDATE = '/product/update'
export const PRODUCT_REMOVE = '/product/remove'
export const STOCK_GET = '/product/stock/sellable/get'
export const PRICE_QUANTITY_UPDATE = '/product/price_quantity/update'
export const ORDERS_LIST = '/orders/get'
export const ORDER_GET = '/order/get'
export const ORDER_ITEMS_GET = '/order/items/get'
export const ORDER_RTS = '/order/rts'
export const ORDER_PACK = '/order/package/pack'
export const LOGISTIC_TRACKING = '/logistic/tracking'
