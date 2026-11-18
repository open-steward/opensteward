/**
 * Finix REST API constants.
 *
 * Finix exposes two host environments. A merchant's API keys are scoped to
 * one of them; the connection selects which via `credentials.extra.live`.
 * Finix pins request behaviour with a `Finix-Version` header (a release
 * date) so transforms stay deterministic — bump this when re-testing
 * against a newer version.
 *
 * Docs: https://docs.finix.com/api/section/authentication
 */
export const SANDBOX_BASE_URL = 'https://finix.sandbox-payments-api.com'
export const LIVE_BASE_URL = 'https://finix.live-payments-api.com'

/** Default host when the connection doesn't flag itself as live. */
export const API_BASE_URL = SANDBOX_BASE_URL

/** Pinned Finix API version, sent on every request as `Finix-Version`. */
export const API_VERSION = '2022-02-01'

export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 100

/**
 * Finix is USD-centric and the dispute resource omits a currency field;
 * canonical schemas require a 3-letter ISO 4217 code, so fall back to this.
 */
export const DEFAULT_CURRENCY = 'USD'
