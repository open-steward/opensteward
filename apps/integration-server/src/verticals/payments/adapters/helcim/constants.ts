/**
 * Helcim REST API constants.
 *
 * Helcim is a single-host API: the same base URL serves every merchant, and
 * the `api-token` (minted in the Helcim panel under All Tools → Integrations →
 * API Access Configurations) selects the merchant/account context. There is no
 * separate sandbox host — a token is bound to the account it was created in.
 *
 * The API is versioned in the URL path (`/v2`). Money is sent and returned as
 * decimal dollars (e.g. `100.99`), so transforms convert to/from integer minor
 * units. Datetimes are `YYYY-MM-DD HH:MM:SS` (Mountain Time, no offset).
 *
 * Docs: https://devdocs.helcim.com/docs/overview-of-helcim-api
 */
export const API_BASE_URL = 'https://api.helcim.com/v2'

/** Helcim list `limit` accepts 1–1000; the API default is also 1000. */
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 1000

// ── Endpoint paths ──────────────────────────────────────────────────────────
export const CONNECTION_TEST_PATH = '/connection-test'
export const CUSTOMERS_PATH = '/customers'
/** Read model for completed card transactions (canonical Charges). */
export const CARD_TRANSACTIONS_PATH = '/card-transactions'
/** Write model: create a purchase (canonical createCharge). */
export const PAYMENT_PURCHASE_PATH = '/payment/purchase'
/** Write model: refund an existing transaction (canonical createRefund). */
export const PAYMENT_REFUND_PATH = '/payment/refund'
/** Invoice CRUD (`GET /invoices`, `POST /invoices`, `PATCH /invoices/{id}`). */
export const INVOICES_PATH = '/invoices'
/** Stored cards under a customer (`GET /customers/{id}/cards`). */
export const CUSTOMER_CARDS_PATH = (customerId: string): string =>
  `/customers/${customerId}/cards`
/** Recurring payment plans (`GET /payment-plans`, `GET /payment-plans/{id}`). */
export const PAYMENT_PLANS_PATH = '/payment-plans'
/** Recurring subscriptions (`GET /subscriptions`, `GET /subscriptions/{id}`). */
export const SUBSCRIPTIONS_PATH = '/subscriptions'
