export const EASYPOST_API_BASE = 'https://api.easypost.com/v2/'

// EasyPost uses API key auth — no OAuth endpoints
export const EASYPOST_DASHBOARD_URL = 'https://www.easypost.com/account/api-keys'

// Rate limits: EasyPost allows 60 req/s on production, 10 req/s on test
export const RATE_LIMIT_RPS = 60
export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100
