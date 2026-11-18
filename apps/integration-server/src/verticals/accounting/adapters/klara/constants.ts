// KLARA Public API — Swiss SME business suite by Swiss Post
// Docs: https://api.klara.ch/docs

export const KLARA_AUTH_URL = 'https://auth.klara.ch/oauth2/authorize'
export const KLARA_TOKEN_URL = 'https://auth.klara.ch/oauth2/token'
export const KLARA_API_BASE = 'https://api.klara.ch/v1'

// Rate limit: KLARA does not publish a specific RPM; 120 req/min is conservative
export const RATE_LIMIT_RPM = 120
export const MAX_PAGE_SIZE = 200
export const DEFAULT_PAGE_SIZE = 50

// OAuth2 scopes
export const KLARA_DEFAULT_SCOPES = [
  'accounting',
  'contacts',
  'invoices',
  'offline_access',
]
