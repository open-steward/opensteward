/**
 * BitPay Cryptocurrency Checkout REST API.
 *
 * Two environments served on distinct hosts (the API token is minted per
 * environment in the BitPay dashboard, so the host — not the token — selects
 * sandbox vs production):
 *   - production: https://bitpay.com
 *   - test:       https://test.bitpay.com
 *
 * The API is versioned via the `X-Accept-Version` header (pinned 2.0.0), not
 * the URL path. We integrate against the `pos` facade: the token is carried in
 * the request body (POST) or as a query param (GET) and needs no ECDSA request
 * signing (no X-Identity / X-Signature headers).
 *
 * Docs: https://developer.bitpay.com/reference/concepts
 *       https://developer.bitpay.com/reference/environments
 */
export const PRODUCTION_BASE_URL = 'https://bitpay.com'
export const TEST_BASE_URL = 'https://test.bitpay.com'

/** Vendor API version, pinned via the `X-Accept-Version` header. */
export const API_VERSION = '2.0.0'

/** BitPay `limit` is an integer page size; the listing window is date-bounded. */
export const DEFAULT_PAGE_SIZE = 50

// ── Endpoint paths ──────────────────────────────────────────────────────────
/** Invoices map onto the canonical Charge. */
export const INVOICES_PATH = '/invoices'
/** Refunds: POST /refunds (create), GET /refunds?invoiceId=… (list). */
export const REFUNDS_PATH = '/refunds'

/**
 * Resolve the host for a given environment. Anything other than the explicit
 * string `production` resolves to the test host — fail safe to sandbox.
 */
export function baseUrlForEnvironment(environment: string | undefined): string {
  return environment === 'production' ? PRODUCTION_BASE_URL : TEST_BASE_URL
}
