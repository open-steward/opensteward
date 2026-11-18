export const INTELIPOST_API_BASE = 'https://api.intelipost.com.br/api/v1'

// Intelipost uses API key authentication — no OAuth endpoints.
// Keys are generated in the merchant dashboard.
export const INTELIPOST_DASHBOARD_URL = 'https://app.intelipost.com.br/settings/api'

// Intelipost rate limits: ~60 req/min per key on standard plans
export const RATE_LIMIT_RPM = 60
