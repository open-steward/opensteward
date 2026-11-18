/**
 * Pyrus REST API v4 constants.
 *
 * Auth token is obtained by posting credentials to the accounts endpoint,
 * then all API calls go to api.pyrus.com/v4/.
 */
export const AUTH_URL = 'https://accounts.pyrus.com/api/v4/auth'
export const API_BASE_URL = 'https://api.pyrus.com/v4'

/** Default item_count for paginated list endpoints (max 200 per Pyrus docs). */
export const DEFAULT_PAGE_SIZE = 200
