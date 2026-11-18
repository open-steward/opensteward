// Soldo Business API v2
// Docs: https://developer.soldo.com/

// Token endpoint — client_credentials grant (POST form-urlencoded)
// No authorization-code flow; credentials are API-key style (client_id + client_secret)
export const SOLDO_TOKEN_URL = 'https://api.soldo.com/oauth/authorize'

// REST base URL (single production environment; Soldo has no public sandbox)
export const SOLDO_API_BASE = 'https://api.soldo.com/business/v2'

// Rate limits: 600 req/min, 20 req/s
export const RATE_LIMIT_RPM = 600
// Soldo paginates with p (0-indexed page) and s (page size, max 50)
export const MAX_PAGE_SIZE = 50
export const DEFAULT_PAGE_SIZE = 50
