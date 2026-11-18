export const SHIPPO_API_BASE = 'https://api.goshippo.com/'

// Shippo uses API key auth — no OAuth endpoints
export const SHIPPO_DASHBOARD_URL = 'https://apps.goshippo.com/settings/api'

// Rate limits: Shippo does not document exact numbers; use 429 backoff
export const RATE_LIMIT_RPS = 60
export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 100
