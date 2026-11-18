export const SHIPTHEORY_API_BASE = 'https://api.shiptheory.com/v1'

// Shiptheory uses email/password to obtain a JWT bearer token
export const SHIPTHEORY_TOKEN_PATH = '/token'

// Dashboard URL for directing users to obtain API credentials
export const SHIPTHEORY_DASHBOARD_URL = 'https://shiptheory.com/login'

// JWT tokens expire after 60 minutes; we refresh at 55 min to be safe
export const TOKEN_TTL_MS = 60 * 60 * 1000
export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000

export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 100

// Maximum date range for search queries (API enforces 365-day window)
export const SEARCH_MAX_DAYS = 365
