/**
 * Nexi Checkout (a.k.a. Nets Easy) Payment API v1 constants.
 *
 * The REST API is hosted on the DIBS payment domain. Test and live share the
 * same path structure; only the host differs. The secret API key submitted at
 * connect time already pins the environment (a test key only works against the
 * test host, a live key only against live), so the adapter defaults to the live
 * host and lets the client override the base URL when needed.
 *
 * Docs: https://developer.nexigroup.com/nexi-checkout/en-EU/api/payment-v1/
 */
export const API_BASE_URL = 'https://api.dibspayment.eu'
export const TEST_API_BASE_URL = 'https://test.api.dibspayment.eu'

/** API version segment prefixing every resource path. */
export const API_VERSION = 'v1'

/**
 * The Payment API v1 has no offset/cursor list endpoints for payments, charges
 * or refunds (bulk reads live in the separate Reporting API), but we still keep
 * a sane page-size constant for any forward-compatible request shaping.
 */
export const DEFAULT_PAGE_SIZE = 100
