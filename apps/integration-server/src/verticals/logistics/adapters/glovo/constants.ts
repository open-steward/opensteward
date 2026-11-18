export const GLOVO_API_BASE_PROD = 'https://api.glovoapp.com'
export const GLOVO_API_BASE_SANDBOX = 'https://stageapi.glovoapp.com'

// Default to production; individual client instances may override.
export const GLOVO_API_BASE = GLOVO_API_BASE_PROD

export const GLOVO_DASHBOARD_URL = 'https://api.glovoapp.com'

// Rate limits: Glovo enforces per-endpoint throttling; 60 req/min is a safe default.
export const RATE_LIMIT_RPM = 60
