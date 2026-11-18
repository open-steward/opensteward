export const QUIQUP_API_BASE = 'https://api.quiqup.com/v1/'
export const QUIQUP_AUTH_BASE = 'https://auth.quiqup.com/'
export const QUIQUP_TOKEN_PATH = 'oauth/token'
export const QUIQUP_DASHBOARD_URL = 'https://partners.quiqup.com/'
export const QUIQUP_DOCS_URL = 'https://api-docs.quiqup.com/'

// OAuth2 scopes for Quiqup partner API
export const QUIQUP_SCOPES = ['orders:read', 'orders:write', 'tracking:read']

// Token refresh buffer: refresh 5 minutes before expiry
export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000

// Pagination defaults
export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100

// Rate limits: Quiqup allows up to 60 req/min per partner
export const RATE_LIMIT_RPM = 60
