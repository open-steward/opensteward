/**
 * 2Checkout (Verifone) REST 6.0 API constants.
 *
 * 2Checkout exposes a single host for both live and test traffic — test
 * orders are flagged per-request rather than routed to a separate sandbox
 * host, so there is no distinct sandbox base URL.
 *
 * Docs: https://docs.2checkout.com/get-started-with-the-2checkout-api
 */
export const API_VERSION = '6.0'
export const API_BASE_URL = 'https://api.2checkout.com/rest/6.0'

/**
 * HMAC algorithm advertised in the `algo="…"` portion of the
 * `X-Avangate-Authentication` header. 2Checkout accepts `sha256` or
 * `sha3-256`; MD5 is deprecated and intentionally not supported here.
 */
export const AUTH_ALGO = 'sha256'

/** Node `crypto` digest name corresponding to {@link AUTH_ALGO}. */
export const AUTH_HASH_ALGORITHM = 'sha256'

export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 100
