export const INFAKT_API_BASE = 'https://api.infakt.pl/api/v3'
export const INFAKT_SANDBOX_API_BASE = 'https://api.sandbox-infakt.pl/api/v3'

// Rate limits: 300 GET req/60s per IP, 150 write req/60s per IP
export const RATE_LIMIT_GET_RPM = 300
export const RATE_LIMIT_WRITE_RPM = 150

// Pagination: offset-based, max 100 per page
export const MAX_PAGE_SIZE = 100
export const DEFAULT_PAGE_SIZE = 50
