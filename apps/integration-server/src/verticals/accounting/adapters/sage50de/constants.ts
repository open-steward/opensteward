// Sage Accounting (which covers Sage 50 cloud in Germany) uses oauth.accounting.sage.com
// for OAuth2, not id.sage.com (which is Sage 200 / Sage ID platform).
export const SAGE50DE_AUTH_URL = 'https://oauth.accounting.sage.com/authorize'
export const SAGE50DE_TOKEN_URL = 'https://oauth.accounting.sage.com/token'
// API v3.1 uses a single unified base URL for all supported countries including Germany.
export const SAGE50DE_API_BASE = 'https://api.accounting.sage.com/v3.1'

export const RATE_LIMIT_RPD = 5000
export const MAX_PAGE_SIZE = 200
export const DEFAULT_PAGE_SIZE = 50
