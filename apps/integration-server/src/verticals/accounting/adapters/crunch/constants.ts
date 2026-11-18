export const CRUNCH_AUTH_URL = 'https://oauth.crunch.co.uk/authorize'
export const CRUNCH_TOKEN_URL = 'https://oauth.crunch.co.uk/token'
export const CRUNCH_API_BASE = 'https://public-api.crunch.co.uk/v1'

// Crunch does not publish a separate sandbox base URL.
// Pagination: zero-indexed pages, max 200 records per page.
export const MAX_PAGE_SIZE = 200
export const DEFAULT_PAGE_SIZE = 20

// Default scopes covering CRUD on all resources plus refresh tokens.
export const DEFAULT_SCOPES = ['read:all', 'create:all', 'update:all', 'offline_access']
