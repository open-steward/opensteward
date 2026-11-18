export const SHIPCLOUD_API_BASE = 'https://api.shipcloud.io/v1/'

// shipcloud uses API key auth — no OAuth endpoints
export const SHIPCLOUD_DASHBOARD_URL = 'https://app.shipcloud.io/en/user/api_key'

// Rate limits per the API docs: four RateLimit-* headers are returned with every response
export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 100
