/**
 * Reckon One API v2 constants.
 *
 * Identity server: https://identity.reckon.com (IdentityServer4)
 * REST base: https://api.reckon.com/R1/{cashbookId}/
 *
 * Docs: https://developer.reckon.com / https://api-v2.reckonone.com/swagger
 */

// OAuth2 / Identity endpoints
export const RECKON_AUTH_URL = 'https://identity.reckon.com/connect/authorize'
export const RECKON_TOKEN_URL = 'https://identity.reckon.com/connect/token'

// REST API base — cashbookId (tenantId) is appended per request
export const RECKON_API_BASE = 'https://api.reckon.com/R1'

// Default OAuth2 scopes for Reckon One
// openid + offline_access for tokens, reckon.one.* for resource access
export const RECKON_DEFAULT_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'reckon.one',
]

// Rate limit: ~60 req/min (conservative; Reckon does not publish a hard limit)
export const RATE_LIMIT_RPM = 60
// Reckon One returns max 50 records per page by default; can request up to 100
export const MAX_PAGE_SIZE = 100
export const DEFAULT_PAGE_SIZE = 50
