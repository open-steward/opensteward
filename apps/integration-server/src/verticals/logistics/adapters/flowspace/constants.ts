/**
 * Flowspace — on-demand fulfillment network API
 *
 * Docs: https://flow.space/platform
 * Auth: API key (Bearer token in Authorization header)
 */

/** Base URL for all Flowspace API calls. */
export const FLOWSPACE_API_BASE = 'https://api.flow.space/v1/'

/**
 * Flowspace does not use OAuth2. API keys are generated in the dashboard
 * under Account → Integrations → API Keys.
 */
export const FLOWSPACE_DASHBOARD_URL = 'https://app.flow.space/settings/api-keys'

/**
 * Flowspace imposes a 120 req/min rate limit on standard plans.
 * We cap pages to 100 items to stay well inside burst limits.
 */
export const RATE_LIMIT_RPM = 120
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100
