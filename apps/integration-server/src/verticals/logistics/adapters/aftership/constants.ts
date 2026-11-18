export const AFTERSHIP_API_BASE = 'https://api.aftership.com/tracking/2024-10/'

// AfterShip Shipping (Postmen) API — labels, rates, manifests
export const AFTERSHIP_SHIPPING_API_BASE = 'https://api.aftership.com/postmen/v3/'

// AfterShip uses API key auth — no OAuth endpoints
export const AFTERSHIP_DASHBOARD_URL = 'https://admin.aftership.com/settings/api-keys'

// Rate limits: AfterShip allows 10 req/s on standard plans
export const RATE_LIMIT_RPS = 10
export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100
