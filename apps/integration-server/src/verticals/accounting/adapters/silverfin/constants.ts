// OAuth2: authorize has no firm_id prefix; token URL requires firm_id injected at runtime
// as https://live.getsilverfin.com/f/{firm_id}/oauth/token
// firm_id is returned as a query param on the OAuth2 redirect and must be stored in credentials.extra
export const SILVERFIN_AUTH_URL = 'https://live.getsilverfin.com/oauth/authorize'
export const SILVERFIN_TOKEN_BASE_URL = 'https://live.getsilverfin.com'
// API base requires firm_id injected at runtime: https://live.getsilverfin.com/v4/f/{firm_id}/
export const SILVERFIN_API_BASE_URL = 'https://live.getsilverfin.com'
export const SILVERFIN_API_VERSION = 'v4'

// Rate limit: variable — retry on 429 with Retry-After header
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 200
