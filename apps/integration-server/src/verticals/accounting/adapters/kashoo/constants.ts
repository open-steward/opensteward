// Kashoo API base URL — business-scoped resources use /businesses/{business_id}/ prefix
export const KASHOO_API_BASE = 'https://app.kashoo.com/api'
// OAuth2 endpoints
export const KASHOO_AUTH_URL = 'https://app.kashoo.com/api/oauth2/authorize'
export const KASHOO_TOKEN_URL = 'https://app.kashoo.com/api/oauth2/token'

// Rate limit: not officially published — retry on 429
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100
