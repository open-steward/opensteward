export const LOCATE2U_API_BASE = 'https://api.locate2u.com/api/v1/'

/** OAuth2 token endpoint (production). */
export const LOCATE2U_TOKEN_URL = 'https://id.locate2u.com/connect/token'

/** OAuth2 scope required for all API access. */
export const LOCATE2U_SCOPE = 'locate2u.api'

export const LOCATE2U_DASHBOARD_URL = 'https://app.locate2u.com/'

/** Proactively refresh tokens 5 minutes before expiry (30 min total TTL). */
export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 500
