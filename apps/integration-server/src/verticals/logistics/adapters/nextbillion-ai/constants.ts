/**
 * NextBillion.ai API constants.
 *
 * Base URL:    https://api.nextbillion.io
 * Auth method: API key passed as `key` query parameter on every request.
 */

export const NEXTBILLION_API_BASE = 'https://api.nextbillion.io'

/** Skynet (Live Tracking) sub-path. */
export const NEXTBILLION_SKYNET_BASE = 'https://api.nextbillion.io/skynet'

/** Dashboard URL for obtaining API keys. */
export const NEXTBILLION_DASHBOARD_URL = 'https://nextbillion.ai/dashboard'

/** Route optimisation API version */
export const OPTIMIZATION_VERSION = 'v2'

/** Default/max page sizes (Live Tracking list endpoint). */
export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100

/** Rate limits (public docs): 6000 req/min for tracking. */
export const RATE_LIMIT_RPM = 6000
