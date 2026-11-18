/**
 * Stripe REST API constants.
 *
 * Stripe pins API behaviour with a `Stripe-Version` header. We pin a known
 * good version here so the adapter's transforms are deterministic — bump
 * this when the adapter is re-tested against a newer one.
 *
 * The value has to be a release Stripe actually cut: the header is
 * `<date>.<codename>` and Stripe answers 400 "Invalid Stripe API version"
 * to any pair that never shipped. `2025-09-30.basil` was one — the codename
 * turned over to clover on that date — and every list call failed on it.
 * `2025-08-27.basil` is the last basil release, which is what the transforms
 * in this adapter were written against. Confirmed live on 2026-09-03.
 */
export const API_VERSION = '2025-08-27.basil'
export const API_BASE_URL = 'https://api.stripe.com/v1'
export const OAUTH_AUTHORIZE_URL = 'https://connect.stripe.com/oauth/authorize'
export const OAUTH_TOKEN_URL = 'https://connect.stripe.com/oauth/token'

export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 100

/**
 * Default Stripe Connect scopes. `read_write` permits the full set of
 * Stripe API calls under the connected account.
 */
export const DEFAULT_SCOPES = ['read_write']
