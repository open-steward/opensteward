/**
 * Yapily API constants.
 *
 * OAUTH_AUTHORIZE_URL and OAUTH_TOKEN_URL drive an authorization_code flow
 * (auth.ts) that Yapily does not document. Yapily documents HTTP Basic auth:
 * "All API requests require Basic Authentication using your Application ID and
 * Application Secret." /oauth/token is not a path in its OpenAPI spec, and
 * /account-auth-requests is POST "Create Account Authorisation".
 *
 * Docs: https://docs.yapily.com/api-reference/introduction
 */

export const OAUTH_AUTHORIZE_URL = 'https://api.yapily.com/account-auth-requests'
export const OAUTH_TOKEN_URL = 'https://api.yapily.com/oauth/token'

export const DEFAULT_SCOPES = ['accounts', 'transactions', 'payments', 'balances']
