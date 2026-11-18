export const TRIPLETEX_API_BASE = 'https://tripletex.no/v2'

// Auth: session tokens obtained via consumer + employee token
export const TRIPLETEX_SESSION_URL = `${TRIPLETEX_API_BASE}/token/session/:create`

// Rate limit: variable
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 5000
