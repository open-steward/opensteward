/**
 * IntaSend REST API constants.
 *
 * IntaSend is a two-host API: the host selects the environment, and the API
 * **key pair** must match it. A sandbox key works only against the sandbox
 * host; a live `ISSecretKey_live_…` / `ISPubKey_live_…` pair only against
 * production. We default to production and let the credential form flip a
 * `sandbox` flag (stored on `credentials.extra`).
 *
 * The API is path-versioned at `/api/v1`.
 *
 * Docs:
 *   https://developers.intasend.com/docs/authentication
 *   https://developers.intasend.com/docs/api-testing-and-sandbox
 */
export const PROD_BASE_URL = 'https://payment.intasend.com'
export const SANDBOX_BASE_URL = 'https://sandbox.intasend.com'

/** Path prefix shared by every REST resource. */
export const API_PREFIX = '/api/v1'

/**
 * The caller's page size when no `limit` is given. IntaSend list endpoints
 * page by `page` alone and return `{ count, next, previous, results }`; no
 * page-size parameter is documented, so the server's page size is fixed and
 * the adapter cuts the caller's rows out of upstream pages (see `pageList`).
 */
export const DEFAULT_PAGE_SIZE = 50

// ── Endpoint paths (appended to API_PREFIX) ─────────────────────────────────
/** M-Pesa STK-push collection request → creates an invoice (canonical Charge). */
export const COLLECTION_PATH = '/payment/collection/'
/** Poll an invoice's status by id. POST { public_key, invoice_id }. */
export const PAYMENT_STATUS_PATH = '/payment/status/'
/** Chargebacks == canonical Refunds and Disputes. GET (list) / POST (create) / GET /:id. */
export const CHARGEBACKS_PATH = '/chargebacks/'
/** All invoices for the merchant account. GET (list) / GET /:id. */
export const INVOICES_PATH = '/invoices/'
/** Wallet transaction ledger (balance transactions). GET (list) / GET /:id. */
export const TRANSACTIONS_PATH = '/transactions/'
/** Send-money disbursement transactions (canonical Payouts). GET (list) / GET /:id. */
export const SEND_MONEY_TRANSACTIONS_PATH = '/send-money/transactions/'
/**
 * Subscription plans. GET (list, api_v1_subscriptions_plans_list) / GET /:id/
 * (api_v1_subscriptions_plans_retrieve). Hyphenated: `/subscriptions/plans/`
 * is not in the spec and falls into GET /subscriptions/{id}/.
 */
export const SUBSCRIPTION_PLANS_PATH = '/subscriptions-plans/'
/**
 * Subscription customer records. GET (list, api_v1_subscriptions_customers_list)
 * / GET /:id/ (api_v1_subscriptions_customers_retrieve). Hyphenated, as above.
 */
export const SUBSCRIPTION_CUSTOMERS_PATH = '/subscriptions-customers/'
/** Subscriptions. GET (list) / GET /:id. */
export const SUBSCRIPTIONS_PATH = '/subscriptions/'

/** Resolve the host base URL for the chosen environment. */
export function baseUrl(sandbox: boolean): string {
  return sandbox ? SANDBOX_BASE_URL : PROD_BASE_URL
}
