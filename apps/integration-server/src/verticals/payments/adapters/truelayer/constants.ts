/**
 * TrueLayer Payments API v3 constants.
 *
 * Hosts come from the Payments API v3 OpenAPI `servers` block
 * (https://docs.truelayer.com/reference/merchant-account-get-transactions):
 * `https://api.truelayer.com` is the "Production server" and
 * `https://api.truelayer-sandbox.com` the "Sandbox server". The adapter has no
 * environment key, so it uses production.
 *
 * Tokens: https://docs.truelayer.com/reference/generateaccesstoken, "Option 3
 * to generate an `access_token` for the Payments API v3", whose request schema
 * says "The grant type to use must be `client_credentials`". The auth server's
 * "Production server" is `https://auth.truelayer.com`.
 */

export const API_BASE_URL = 'https://api.truelayer.com'
export const OAUTH_TOKEN_URL = 'https://auth.truelayer.com/connect/token'

/** "Scopes for the Payments API v3: - `payments` ..." (generateaccesstoken). */
export const PAYMENTS_SCOPE = 'payments'

/** "All Payments API v3 endpoints now start with `/v3/`." (get-payout). */
export const PAYMENTS_PATH = '/v3/payments'
export const PAYOUTS_PATH = '/v3/payouts'
export const MERCHANT_ACCOUNTS_PATH = '/v3/merchant-accounts'
