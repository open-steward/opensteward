// Rivile GAMA API v2 — all requests POST to this single endpoint
export const RIVILE_API_BASE = 'https://api.manorivile.lt/client/v2'
// User obtains API key from Rivile account settings
export const RIVILE_SETTINGS_URL = 'https://www.rivile.lt/klientams/prisijungimas'

// Rivile returns max 100 records per page; pagenumber param controls pagination
export const RATE_LIMIT_RPM = 100
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 100
