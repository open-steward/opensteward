export const OAUTH_AUTHORIZE_URL = 'https://connect.squareup.com/oauth2/authorize'
export const OAUTH_TOKEN_URL = 'https://connect.squareup.com/oauth2/token'
export const API_BASE_URL = 'https://connect.squareup.com/v2'

export const SQUARE_VERSION = '2024-09-19'

export const DEFAULT_PAGE_SIZE = 100

/**
 * Documented `limit` maximum of ListPayments, ListPaymentRefunds,
 * ListPayouts, ListPayoutEntries ("The default value of 100 is also the
 * maximum allowed value") and ListCustomers ("greater than 100, Square
 * returns a 400 VALUE_TOO_HIGH error").
 */
export const MAX_PAGE_SIZE = 100
/** ListInvoices: "200 is the maximum `limit`". */
export const INVOICES_MAX_PAGE_SIZE = 200
/** SearchCatalogObjects: "higher than the maximum limit of 1,000, it will be ignored." */
export const CATALOG_MAX_PAGE_SIZE = 1000

export const DEFAULT_SCOPES = [
  'PAYMENTS_READ',
  'PAYMENTS_WRITE',
  'CUSTOMERS_READ',
  'CUSTOMERS_WRITE',
  'INVOICES_READ',
  'INVOICES_WRITE',
  'SUBSCRIPTIONS_READ',
  'SUBSCRIPTIONS_WRITE',
  'MERCHANT_PROFILE_READ',
]
