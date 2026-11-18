/**
 * Payoneer API constants.
 *
 * Payoneer uses OAuth2 with OpenID Connect. The PSD2 portal is used for
 * open-banking flows; the mass-payout API uses client-credentials against
 * the v4 API.
 *
 * Docs: https://developer.payoneer.com/psd2/get-started
 */

export const API_BASE_URL = 'https://api.payoneer.com/v4'
export const OAUTH_AUTHORIZE_URL = 'https://login.payoneer.com/api/v2/oauth2/authorize'
export const OAUTH_TOKEN_URL = 'https://login.payoneer.com/api/v2/oauth2/token'

/**
 * Default Payoneer scopes.
 * `read write` covers both read-only and write operations.
 */
export const DEFAULT_SCOPES = ['read', 'write']
