export const TRACK17_API_BASE = 'https://api.17track.net/track/v2.2'

// 17TRACK uses API key auth — no OAuth endpoints
export const TRACK17_DASHBOARD_URL = 'https://api.17track.net/admin/settings'

// Rate limits: 3 requests per second; batch up to 40 numbers per request
export const RATE_LIMIT_RPS = 3
export const MAX_BATCH_SIZE = 40
export const DEFAULT_PAGE_SIZE = 40
export const MAX_PAGE_SIZE = 40
