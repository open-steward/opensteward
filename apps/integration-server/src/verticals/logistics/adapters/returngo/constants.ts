/**
 * ReturnGO API constants.
 *
 * Base URL:  https://api.returngo.ai/v1
 * Auth:      API key (x-api-key header) + shop name (x-shop-name header)
 * Rate limit: 2,000 calls/day, 5 calls/second (HTTP 429 on breach)
 */

export const RETURNGO_API_BASE = 'https://api.returngo.ai/v1'

// Shown to users when they need to obtain their API credentials
export const RETURNGO_DASHBOARD_URL =
  'https://app.returngo.ai/dashboard/settings/integrations/api'

export const RATE_LIMIT_RPS = 5
export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100
