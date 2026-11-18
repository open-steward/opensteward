// Directo REST API — production base URL
// Docs: https://wiki.directo.ee/en/api_direct
export const DIRECTO_API_BASE = 'https://login.directo.ee/apidirect/v1/'

// Auth: X-Directo-Key header (API key issued per company in Directo ERP settings)
export const DIRECTO_API_KEY_HEADER = 'X-Directo-Key'

// Rate limit: Directo recommends max 60 req/min
export const RATE_LIMIT_RPM = 60

// Directo does not paginate via offset/limit — use timestamp filtering for large sets.
// We apply a default ts-based approach and do not send page params.
export const DEFAULT_PAGE_SIZE = 100
