/**
 * Unzer Payment API constants.
 *
 * Unzer is environment-bound by key *prefix*: a sandbox private key starts
 * `s-priv-…` and only works against the sandbox host; a production key starts
 * `p-priv-…` and only works against production. We resolve the host from the
 * key prefix at credential-exchange time (see auth.ts) so callers never pick
 * the wrong environment.
 *
 * Docs: https://docs.unzer.com/server-side-integration/api-basics/
 */
export const PRODUCTION_BASE_URL = 'https://api.unzer.com/v1'
export const SANDBOX_BASE_URL = 'https://sbx-api.unzer.com/v1'
/** Default host when the key prefix is unrecognised — the safer sandbox host. */
export const DEFAULT_BASE_URL = SANDBOX_BASE_URL

/** Resource paths, appended to the `…/v1` base. */
export const CUSTOMERS_PATH = '/customers'
export const CHARGES_PATH = '/payments/charges'
export const PAYMENTS_PATH = '/payments'
export const PAYOUTS_PATH = '/payments/payouts'
export const TYPES_PATH = '/types'
