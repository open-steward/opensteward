// Misoca (Yayoi) API constants
// Docs: https://doc.misoca.jp/v3/

export const MISOCA_AUTH_URL = 'https://app.misoca.jp/oauth2/authorize'
export const MISOCA_TOKEN_URL = 'https://app.misoca.jp/oauth2/token'

// Misoca does not provide a separate sandbox environment.
export const MISOCA_API_BASE = 'https://app.misoca.jp/api/v3/'

// Pagination: page-based, max 100 per page (RFC 5988 Link header for next/last)
export const MAX_PAGE_SIZE = 100
export const DEFAULT_PAGE_SIZE = 25

// Default scopes: "write" implies read access per Misoca docs
export const DEFAULT_SCOPES = ['write']
