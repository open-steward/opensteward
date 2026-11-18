/**
 * Atome (apaylater) Payment API v2 — "For Online Integration".
 *
 * Atome is a buy-now-pay-later gateway across South-East Asia (Singapore,
 * Malaysia, Indonesia, Thailand, the Philippines). The v2 API is RESTful and
 * **payment-centric**: a `payment` object tracks the whole lifecycle —
 * creation, status, cancellation, and refunds — so it maps onto the canonical
 * **Charge**, and the refund sub-transactions map onto canonical **Refunds**.
 *
 * There are two base hosts that speak the identical API; the merchant picks
 * test vs. production on the Connect form and we persist it on
 * `credentials.extra.environment`. There is no list endpoint — payments are
 * addressed individually by the merchant-supplied `referenceId`.
 *
 * Docs: https://doc.apaylater.com/v2/
 */

/** Sandbox / test base host (the path already carries the `/v2` prefix). */
export const TEST_BASE_URL = 'https://api.apaylater.net/v2'
/** Production base host. */
export const PRODUCTION_BASE_URL = 'https://api.apaylater.com/v2'

export type AtomeEnvironment = 'sandbox' | 'production'

export const DEFAULT_ENVIRONMENT: AtomeEnvironment = 'sandbox'

/** Resolve the base host for the selected environment. Defaults to sandbox. */
export function baseUrlFor(environment: string | undefined): string {
  return environment === 'production' ? PRODUCTION_BASE_URL : TEST_BASE_URL
}

// ── Endpoint paths (relative to the base host, which already carries `/v2`) ──
/** Configuration / connectivity probe. */
export const AUTH_PATH = '/auth'
/** Create a new payment (idempotent on `referenceId`). */
export const PAYMENTS_PATH = '/payments'
/** Retrieve a single payment by its `referenceId`. */
export const paymentPath = (referenceId: string): string => `/payments/${referenceId}`
/** Refund a payment (full or partial), by `referenceId`. */
export const paymentRefundPath = (referenceId: string): string =>
  `/payments/${referenceId}/refund`
/** Cancel an unpaid payment, by `referenceId`. */
export const paymentCancelPath = (referenceId: string): string =>
  `/payments/${referenceId}/cancel`

/**
 * Currencies Atome supports — one per merchant country. Used only as a
 * defensive default when a payload omits the currency (Atome always echoes it).
 */
export const SUPPORTED_CURRENCIES = ['SGD', 'MYR', 'IDR', 'THB', 'PHP'] as const
export const DEFAULT_CURRENCY = 'SGD'
