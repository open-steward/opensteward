/**
 * LEDGERS.Cloud API constants.
 *
 * Docs: https://ledgers.readme.io/reference/introduction-1
 *
 * Auth: API key (x-api-key header) + session token obtained via POST /v3/login.
 * Tokens expire after 24 hours.
 */

export const LEDGERS_API_BASE = 'https://in-api.ledgers.cloud/v3'
export const LEDGERS_SANDBOX_API_BASE = 'https://in-api-uat.ledgers.cloud/v3'
export const LEDGERS_LOGIN_URL = `${LEDGERS_API_BASE}/login`

// Rate limit: 1,000 requests/hour per API key
export const RATE_LIMIT_RPH = 1000
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 200
