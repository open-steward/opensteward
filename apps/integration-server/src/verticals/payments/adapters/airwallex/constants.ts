/**
 * Airwallex REST API constants.
 *
 * Airwallex runs two fully separate environments selected by host:
 *   - production:    https://api.airwallex.com
 *   - demo / sandbox: https://api-demo.airwallex.com
 *
 * A given client-id + api-key pair belongs to exactly one environment, so the
 * adapter lets the merchant pick the environment on the Connect Link form and
 * carries the resolved base URL on `credentials.extra.baseUrl`.
 *
 * Auth is a short-lived bearer token minted from the api-key via the login
 * endpoint (valid ~30 min). The payments resources live under the `/api/v1/pa`
 * prefix.
 *
 * Docs: https://www.airwallex.com/docs/api
 */
export const PROD_BASE_URL = 'https://api.airwallex.com'
export const DEMO_BASE_URL = 'https://api-demo.airwallex.com'

/** Mints a ~30-minute bearer token from `x-client-id` + `x-api-key`. */
export const LOGIN_PATH = '/api/v1/authentication/login'

// ── Payments (`/api/v1/pa`) resource paths ──────────────────────────────────
export const PAYMENT_INTENTS_PATH = '/api/v1/pa/payment_intents'
export const REFUNDS_PATH = '/api/v1/pa/refunds'
export const CUSTOMERS_PATH = '/api/v1/pa/customers'

/** Airwallex creates use a trailing `/create`; retrieves use `/{id}`. */
export const CREATE_SUFFIX = '/create'

export function paymentIntentCancelPath(id: string): string {
  return `${PAYMENT_INTENTS_PATH}/${id}/cancel`
}

/** Airwallex list endpoints accept `page_num` (0-indexed) + `page_size`. */
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 1000
