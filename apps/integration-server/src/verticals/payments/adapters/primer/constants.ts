/**
 * Primer REST API constants.
 *
 * Primer runs two fully separate environments selected by host:
 *   - production: https://api.primer.io
 *   - sandbox:    https://api.sandbox.primer.io
 *
 * A given API key belongs to exactly one environment, so the adapter lets the
 * merchant pick the environment on the Connect Link form and carries the
 * resolved base URL on `credentials.extra.baseUrl`.
 *
 * Requests are pinned to a wire version with the `X-Api-Version` header so the
 * adapter's transforms stay deterministic — bump `API_VERSION` when the adapter
 * is re-tested against a newer one.
 *
 * Docs: https://primer.io/docs/api-reference/get-started/authentication
 */
export const PROD_BASE_URL = 'https://api.primer.io'
export const SANDBOX_BASE_URL = 'https://api.sandbox.primer.io'

/** Pinned Primer wire version (sent as the `X-Api-Version` header). */
export const API_VERSION = '2.4'

// ── Payments resource paths ─────────────────────────────────────────────────
/** Search & list / retrieve payments; a Primer Payment maps to a canonical Charge. */
export const PAYMENTS_PATH = '/payments'

/** Vaulted payment methods — filter by `customer_id` query param. */
export const PAYMENT_INSTRUMENTS_PATH = '/payment-instruments'

export function paymentRefundPath(id: string): string {
  return `${PAYMENTS_PATH}/${id}/refund`
}

export function paymentCancelPath(id: string): string {
  return `${PAYMENTS_PATH}/${id}/cancel`
}

/**
 * Primer list endpoints paginate with an opaque `cursor` + `limit` and return
 * `{ data, nextCursor, prevCursor }`. The API caps a page at 100.
 */
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 100
