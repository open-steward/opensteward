/**
 * Transportify / Deliveree API constants.
 *
 * Transportify is the Philippine brand of the Deliveree platform.
 * The public API is hosted at api.deliveree.com (production) and
 * api.sandbox.deliveree.com (sandbox).
 *
 * Reference: https://developers.deliveree.com/
 */

export const TRANSPORTIFY_API_BASE_PROD = 'https://api.deliveree.com/public_api/v10'
export const TRANSPORTIFY_API_BASE_SANDBOX = 'https://api.sandbox.deliveree.com/public_api/v10'

// Default to production; callers may override by injecting sandbox base URL.
export const TRANSPORTIFY_API_BASE = TRANSPORTIFY_API_BASE_PROD

export const TRANSPORTIFY_DASHBOARD_URL = 'https://app.transportify.com.ph/settings/api'

// Transportify uses a simple API key — no OAuth.
// The key is supplied as the value of the `Authorization` header (no "Bearer" prefix).

export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 100
