export const DHL_API_BASE = 'https://express.api.dhl.com/mydhlapi'
export const DHL_TEST_API_BASE = 'https://express.api.dhl.com/mydhlapi/test'

// DHL uses API key auth — no OAuth endpoints
export const DHL_DASHBOARD_URL = 'https://developer.dhl.com'

// Rate limits: DHL Express allows ~250 req/min on production
export const RATE_LIMIT_RPS = 4
export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100
