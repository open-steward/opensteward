/**
 * Noon Seller API constants.
 *
 * Noon is a major MENA marketplace operating in the UAE, Saudi Arabia, and Egypt.
 * The Seller API uses a single base URL with locale selection via headers.
 *
 * Authentication: API key passed as `Authorization: Bearer <apiKey>`, or OAuth2
 * for partner integrations.
 */

/** API base URL for Noon's Seller/Partner API. */
export const BASE_URL = 'https://api.noon.com'

/** OAuth2 token endpoint for partner integrations. */
export const TOKEN_ENDPOINT = 'https://api.noon.com/oauth/token'

/** OAuth2 authorization URL for partner integrations. */
export const AUTH_URL_BASE = 'https://login.noon.com/oauth/authorize'

/** Default page size for list endpoints. */
export const DEFAULT_PAGE_SIZE = 20

/** Maximum page size allowed by the Noon API. */
export const MAX_PAGE_SIZE = 200

/** Access tokens expire in ~1 hour; refresh 5 minutes early. */
export const TOKEN_BUFFER_MS = 5 * 60 * 1000

/** Platform identifier reported to clients. */
export const PLATFORM_SLUG = 'noon'

/**
 * Supported Noon locales. Stored in `credentials.extra.locale`.
 * Each maps to the country the seller operates in.
 */
export const SUPPORTED_LOCALES: Record<string, string> = {
  ae: 'United Arab Emirates',
  sa: 'Saudi Arabia',
  eg: 'Egypt',
}

/** Resolve the default currency for a locale. */
export function currencyForLocale(locale: string): string {
  switch (locale.toLowerCase()) {
    case 'ae':
      return 'AED'
    case 'sa':
      return 'SAR'
    case 'eg':
      return 'EGP'
    default:
      return 'AED'
  }
}

// -- API Paths ---------------------------------------------------------------

export const PRODUCTS_LIST = '/seller/products'
export const PRODUCT_GET = '/seller/products'
export const PRODUCT_CREATE = '/seller/products'
export const PRODUCT_UPDATE = '/seller/products'
export const PRODUCT_DELETE = '/seller/products'
export const INVENTORY_LIST = '/seller/inventory'
export const INVENTORY_UPDATE = '/seller/inventory'
export const ORDERS_LIST = '/seller/orders'
export const ORDER_GET = '/seller/orders'
export const ORDER_CANCEL = '/seller/orders'
export const FULFILLMENTS_LIST = '/seller/fulfillments'
export const FULFILLMENT_GET = '/seller/fulfillments'
export const FULFILLMENT_CREATE = '/seller/fulfillments'
export const FULFILLMENT_UPDATE = '/seller/fulfillments'
export const CUSTOMERS_LIST = '/seller/customers'
export const CUSTOMER_GET = '/seller/customers'
