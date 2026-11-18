/**
 * Conekta is a single-host API. The same base URL serves both sandbox and
 * production — the API **key** (configured in the Conekta panel as either a
 * sandbox or live key) selects the environment, not the host.
 *
 * The API is versioned via the `Accept` header (vendor media type), not the
 * URL path. We pin v2.1.0.
 *
 * Docs: https://developers.conekta.com/reference/autenticaci%C3%B3n
 */
export const API_BASE_URL = 'https://api.conekta.io'

/** Vendor media type that pins the API version. */
export const API_VERSION_ACCEPT = 'application/vnd.conekta-v2.1.0+json'

/** Conekta `limit` accepts 1–250; the API default is 20. */
export const DEFAULT_PAGE_SIZE = 50

/**
 * Every list endpoint documents `limit`: "The numbers of items to return, the
 * maximum value is 250" (https://developers.conekta.com/reference/getcustomers.md).
 */
export const MAX_PAGE_SIZE = 250

// ── Endpoint paths ──────────────────────────────────────────────────────────
export const ORDERS_PATH = '/orders'
export const CUSTOMERS_PATH = '/customers'
export const TRANSACTIONS_PATH = '/transactions'
export const PAYOUT_ORDERS_PATH = '/payout_orders'
export const PLANS_PATH = '/plans'
/** Refunds are nested under an order: POST /orders/{id}/refunds */
export const orderRefundsPath = (orderId: string): string => `/orders/${orderId}/refunds`
