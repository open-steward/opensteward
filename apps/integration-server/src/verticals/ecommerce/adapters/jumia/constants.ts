/**
 * Jumia Vendor API constants.
 *
 * Jumia is an African marketplace operating across multiple countries (Nigeria,
 * Kenya, Egypt, Morocco, Ghana, etc.). The Vendor/Seller Center API is REST-based
 * with OAuth2 authentication. Country-specific base URLs route to the appropriate
 * regional instance.
 */

/** Country-specific API base URL mapping. Stored in `credentials.extra.country`. */
export const COUNTRY_HOSTS: Record<string, string> = {
  ng: 'vendor-api.jumia.com.ng',
  ke: 'vendor-api.jumia.co.ke',
  eg: 'vendor-api.jumia.com.eg',
  ma: 'vendor-api.jumia.ma',
  gh: 'vendor-api.jumia.com.gh',
  ci: 'vendor-api.jumia.ci',
  tz: 'vendor-api.jumia.co.tz',
  ug: 'vendor-api.jumia.co.ug',
  sn: 'vendor-api.jumia.sn',
  dz: 'vendor-api.jumia.dz',
  tn: 'vendor-api.jumia.com.tn',
  cm: 'vendor-api.jumia.cm',
  zw: 'vendor-api.jumia.co.zw',
}

/** Resolve the API base URL for a given country code. */
export function resolveBaseUrl(country: string): string {
  const host = COUNTRY_HOSTS[country]
  if (!host) {
    throw new Error(
      `Jumia adapter: unknown country '${country}'. Valid: ${Object.keys(COUNTRY_HOSTS).join(', ')}.`,
    )
  }
  return `https://${host}/v1`
}

/** Global auth endpoint (country-agnostic). */
export const TOKEN_ENDPOINT = 'https://vendor-api.jumia.com/v1/oauth/token'

/** Authorization URL base for the OAuth2 flow. */
export const AUTH_URL_BASE = 'https://vendor-api.jumia.com/v1/oauth/authorize'

/** Default page size for list endpoints. */
export const DEFAULT_PAGE_SIZE = 20

/** Maximum page size allowed by Jumia. */
export const MAX_PAGE_SIZE = 100

/** Access tokens expire in ~1 hour; refresh 5 minutes early. */
export const TOKEN_BUFFER_MS = 5 * 60 * 1000

/** Platform identifier reported to clients. */
export const PLATFORM_SLUG = 'jumia'

// ── API Paths ───────────────────────────────────────────────────────────────

export const PRODUCTS_LIST = '/products'
export const PRODUCT_GET = '/products'
export const PRODUCT_CREATE = '/products'
export const PRODUCT_UPDATE = '/products'
export const PRODUCT_REMOVE = '/products'
export const STOCK_LIST = '/products/stock'
export const STOCK_UPDATE = '/products/stock'
export const ORDERS_LIST = '/orders'
export const ORDER_GET = '/orders'
export const ORDER_ITEMS_GET = '/orders'
export const ORDER_STATUS_UPDATE = '/orders'
export const SHIPMENTS_LIST = '/shipments'
export const SHIPMENT_CREATE = '/shipments'
export const SHIPMENT_GET = '/shipments'
