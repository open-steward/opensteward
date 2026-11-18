/**
 * Square API constants.
 *
 * Square uses date-based API versioning via the `Square-Version` header.
 * We pin a known-good version for deterministic behaviour.
 */

export const SQUARE_VERSION = '2026-01-22'

export const ENVIRONMENTS = {
  production: 'https://connect.squareup.com/v2/',
  sandbox: 'https://connect.squareupsandbox.com/v2/',
} as const

export type SquareEnvironment = keyof typeof ENVIRONMENTS

export const DEFAULT_PAGE_SIZE = 100

/**
 * The largest `limit` each list endpoint accepts, from its reference page.
 * They differ, and going over is not harmless everywhere: ListCustomers
 * answers 400 VALUE_TOO_HIGH above 100, and ListPayments falls back to its
 * default. (The old single MAX_PAGE_SIZE of 200 matched none of them.)
 */
export const PAGE_MAX = {
  /** SearchCatalogObjects: "higher than the maximum limit of 1,000, it will be ignored". */
  catalogSearch: 1000,
  /** ListCustomers: "greater than 100, Square returns a 400 ... VALUE_TOO_HIGH error". */
  customers: 100,
  /** ListPaymentRefunds: "greater than 100, no more than 100 results are returned". */
  refunds: 100,
  /** ListPayments: "The default value of 100 is also the maximum allowed value." */
  payments: 100,
  /** SearchOrders: Default 500, Max 1000. */
  ordersSearch: 1000,
  /** BatchRetrieveInventoryCounts: Min 1, Max 1000. */
  inventoryCounts: 1000,
} as const

/** OAuth token endpoint (always production host, even for sandbox apps). */
export const TOKEN_URL = 'https://connect.squareup.com/oauth2/token'

/** Zero-fraction-digit currencies where 1 unit = 1 cent equivalent. */
export const ZERO_DECIMAL_CURRENCIES = new Set(['JPY', 'KRW', 'VND'])
