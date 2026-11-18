// NuvemFiscal uses OAuth 2.0 client_credentials flow only (no authorization code flow).
export const NUVEMFISCAL_TOKEN_URL = 'https://auth.nuvemfiscal.com.br/oauth/token'
export const NUVEMFISCAL_API_BASE = 'https://api.nuvemfiscal.com.br'

// Rate limit: 1000 req/hr; API default page size is 10 records
export const RATE_LIMIT_RPH = 1000
export const MAX_PAGE_SIZE = 100
export const DEFAULT_PAGE_SIZE = 10
