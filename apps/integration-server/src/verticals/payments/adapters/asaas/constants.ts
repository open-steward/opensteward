/**
 * Asaas REST API constants.
 *
 * Asaas is a Brazilian payment gateway. The API is versioned in the URL path
 * (`/v3`). There are two hosts — production and sandbox — and the **API key**
 * selects the environment (a `$aact_prod_…` key is bound to production, a
 * `$aact_hmlg_…` key to sandbox). We default to the production host; the key
 * itself is the source of truth.
 *
 * Docs: https://docs.asaas.com/docs/authentication-2
 */
export const API_BASE_URL = 'https://api.asaas.com/v3'
export const SANDBOX_BASE_URL = 'https://api-sandbox.asaas.com/v3'

/**
 * Asaas requires a `User-Agent` header on every request for root accounts
 * created on/after 2024-06-13. We pin a stable identifier.
 */
export const USER_AGENT = 'opensteward-integration-server'

/** Asaas `limit` accepts 1–100; the API default is 10. */
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 100

// ── Endpoint paths ──────────────────────────────────────────────────────────
export const CUSTOMERS_PATH = '/customers'
export const PAYMENTS_PATH = '/payments'
export const SUBSCRIPTIONS_PATH = '/subscriptions'
export const TRANSFERS_PATH = '/transfers'
export const CHARGEBACKS_PATH = '/chargebacks'
export const INVOICES_PATH = '/invoices'
export const FINANCIAL_TRANSACTIONS_PATH = '/financialTransactions'

/** Refunds are taken against a payment: POST /payments/{id}/refund */
export const paymentRefundPath = (paymentId: string): string => `/payments/${paymentId}/refund`

/** Submit chargeback dispute evidence: POST /chargebacks/{id}/dispute */
export const chargebackDisputePath = (id: string): string => `/chargebacks/${id}/dispute`
