// eGestor REST API — https://egestor.docs.apiary.io/
// Auth: personal_token exchanged for a short-lived Bearer token via OAuth.
// Docs: https://github.com/eGestor/documentacao-api

export const EGESTOR_OAUTH_URL = 'https://api.egestor.com.br/api/oauth/access_token'
export const EGESTOR_API_BASE = 'https://api.egestor.com.br/api/v1/'

// Rate limit: 60 requests per minute per application+user pair
export const RATE_LIMIT_RPM = 60

// Pagination: eGestor returns exactly 50 records per page (non-configurable)
export const PAGE_SIZE = 50
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 50
