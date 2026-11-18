/**
 * Paymob (Accept) REST API constants.
 *
 * Paymob's gateway lives under a single host with an `/api` prefix; the
 * production host is `accept.paymob.com` (the older `accept.paymobsolutions.com`
 * host is an alias resolving to the same gateway). Paymob does not expose a
 * separate sandbox host — test vs. live mode is selected by the key you present
 * (a test Secret Key looks like `egy_sk_test_…`, live `egy_sk_live_…`).
 *
 * Docs: https://developers.paymob.com/paymob-docs/integration-paths/apis
 */
export const API_BASE_URL = 'https://accept.paymob.com/api'

/** Legacy alias host — same gateway, retained for reference only. */
export const API_BASE_URL_LEGACY = 'https://accept.paymobsolutions.com/api'

/** Exchange a (legacy) API Key for a short-lived bearer token. */
export const AUTH_TOKEN_PATH = '/auth/tokens'

/** Retrieve a single transaction by its Paymob transaction id. */
export const TRANSACTION_PATH = '/acceptance/transactions'

/** Refund a settled transaction (full or partial). */
export const REFUND_PATH = '/acceptance/void_refund/refund'

/** Void an authorised-but-unsettled transaction. */
export const VOID_PATH = '/acceptance/void_refund/void'

/**
 * Paymob settles in piasters/cents (integer minor units) and defaults to
 * Egyptian Pounds. Multi-currency merchants emit an explicit `currency`.
 */
export const DEFAULT_CURRENCY = 'EGP'
