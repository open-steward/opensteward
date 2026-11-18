// Digits Connect API
// Auth: OAuth 2.0 (authorization code)
// Docs: https://developer.digits.com/docs/authentication

export const DIGITS_AUTH_URL = 'https://connect.digits.com/v1/oauth/authorize'
export const DIGITS_TOKEN_URL = 'https://connect.digits.com/v1/oauth/token'
export const DIGITS_API_BASE = 'https://connect.digits.com/v1'

// Default scopes for read-only accounting integration
export const DIGITS_DEFAULT_SCOPES = ['ledger:read']

// Cursor-based pagination — max 100 per page
export const MAX_PAGE_SIZE = 100
export const DEFAULT_PAGE_SIZE = 100
