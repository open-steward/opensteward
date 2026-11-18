/**
 * SumUp API constants.
 *
 * SumUp uses standard OAuth2 authorization-code flow.
 *
 * Docs: https://developer.sumup.com/tools/authorization/oauth
 * API reference: https://developer.sumup.com/api (first-party OpenAPI:
 * https://raw.githubusercontent.com/sumup/sumup-openapi/refs/heads/main/openapi.json,
 * whose only server is "https://api.sumup.com").
 */

export const API_BASE_URL = 'https://api.sumup.com'
export const OAUTH_AUTHORIZE_URL = 'https://api.sumup.com/authorize'
export const OAUTH_TOKEN_URL = 'https://api.sumup.com/token'

/** GET /v1.0/merchants/{merchant_code}/payouts `limit`: "minimum: 1", "maximum: 9999". */
export const PAYOUTS_MAX_LIMIT = 9999

export const DEFAULT_SCOPES = ['payments', 'transactions.history', 'user.profile_readonly']
