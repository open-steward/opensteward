/**
 * Triple-A API constants.
 *
 * Both vendor specs (Crypto-Payments.yaml and Crypto-Payouts.yaml, served from
 * https://developers.triple-a.io/api/v1/projects/triplea-technologies/triplea-api-doc/nodes/references/)
 * declare `servers: - url: 'https://api.triple-a.io/api/v2'`, and their only
 * security scheme is `flows: clientCredentials: tokenUrl:
 * 'https://api.triple-a.io/api/v2/oauth/token'` with `scopes: {}`.
 */

export const API_BASE_URL = 'https://api.triple-a.io/api/v2'
export const OAUTH_TOKEN_URL = 'https://api.triple-a.io/api/v2/oauth/token'

/**
 * GET /payments and GET /payouts, `page_size`: "default: 10" and
 * "Maximum value is `100`."
 */
export const DEFAULT_PAGE_SIZE = 10
export const MAX_PAGE_SIZE = 100
