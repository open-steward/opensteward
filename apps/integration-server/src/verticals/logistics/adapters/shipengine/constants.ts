export const SHIPENGINE_API_BASE = 'https://api.shipengine.com/v1'

// ShipEngine uses API key auth — no OAuth endpoints
export const SHIPENGINE_DASHBOARD_URL = 'https://app.shipengine.com/#/portal/apimanagement'

// Rate limits: ShipEngine allows up to 10 req/s on sandbox, higher in production
export const RATE_LIMIT_RPS = 10
export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 500
