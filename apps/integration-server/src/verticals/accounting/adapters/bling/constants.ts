// Bling ERP API v3 — https://developer.bling.com.br
// Authorization code grant: user is redirected to BLING_AUTH_URL; code exchanged at BLING_TOKEN_URL.
// Auth uses Basic (base64 client_id:client_secret) in the Authorization header.
// Access tokens are short-lived (~1h); refresh tokens expire in 30 days.
export const BLING_AUTH_URL = 'https://www.bling.com.br/Api/v3/oauth/authorize'
export const BLING_TOKEN_URL = 'https://www.bling.com.br/Api/v3/oauth/token'
export const BLING_API_BASE = 'https://api.bling.com.br/Api/v3'

// Pagination — Bling uses ?pagina=1&limite=100 (max 100 per page)
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 100
