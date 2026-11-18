/**
 * Daraz Open Platform API constants.
 *
 * Daraz is an Alibaba subsidiary operating across South Asia (Bangladesh,
 * Pakistan, Nepal, Sri Lanka, Myanmar). The API is nearly identical to
 * Lazada's Open Platform — same signing scheme, same endpoint structure.
 *
 * The adapter stores the country code (e.g. `bd`, `pk`, `np`) in
 * `credentials.extra.country` and resolves the correct base URL at runtime.
 */

/** Country TLD mapping. Stored in `credentials.extra.country`. */
export const COUNTRY_TLDS: Record<string, string> = {
  bd: 'com.bd',
  pk: 'pk',
  np: 'com.np',
  lk: 'lk',
  mm: 'com.mm',
}

/** Resolve the API base URL for a given country code. */
export function resolveBaseUrl(country: string): string {
  const tld = COUNTRY_TLDS[country]
  if (!tld) {
    throw new Error(
      `Daraz adapter: unknown country '${country}'. Valid: ${Object.keys(COUNTRY_TLDS).join(', ')}.`,
    )
  }
  return `https://api.daraz.${tld}/rest`
}

/** Daraz auth token endpoint (country-agnostic). */
export const TOKEN_ENDPOINT = 'https://auth.daraz.com/rest/token/create'

/** Authorization URL base for the OAuth2 flow. */
export const AUTH_URL_BASE = 'https://auth.daraz.com/oauth/authorize'

/** Default page size for list endpoints. */
export const DEFAULT_PAGE_SIZE = 20

/** Maximum page size allowed by Daraz. */
export const MAX_PAGE_SIZE = 100

/** Access tokens expire in ~7 days; refresh 1 hour early. */
export const TOKEN_BUFFER_MS = 60 * 60 * 1000

/** Platform identifier reported to clients. */
export const PLATFORM_SLUG = 'daraz'

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
export const CATEGORY_TREE = '/category/tree/get'
export const FINANCE_TRANSACTION_DETAILS = '/finance/transaction/details/get'
