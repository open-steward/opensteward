// Pleo API base URLs
// Docs: https://developers.pleo.io/docs/current/authentication/api-base-urls
export const PLEO_AUTH_URL = 'https://auth.pleo.io/oauth/authorize'
export const PLEO_TOKEN_URL = 'https://auth.pleo.io/oauth/token'

// REST API base (v1 — legacy/open API spec; served on openapi.pleo.io)
export const PLEO_API_BASE = 'https://openapi.pleo.io/v1'
export const PLEO_STAGING_API_BASE = 'https://openapi.staging.pleo.io/v1'

// Rate limit: 600 req/min
export const RATE_LIMIT_RPM = 600
export const MAX_PAGE_SIZE = 500
export const DEFAULT_PAGE_SIZE = 100
