// Siigo uses username+access_key auth (not OAuth). Token endpoint returns a Bearer token.
export const SIIGO_TOKEN_URL = 'https://api.siigo.com/auth'
export const SIIGO_API_BASE = 'https://api.siigo.com/v1'

// Rate limit: 100 req/min
export const RATE_LIMIT_RPM = 100
export const MAX_PAGE_SIZE = 100
export const DEFAULT_PAGE_SIZE = 25
