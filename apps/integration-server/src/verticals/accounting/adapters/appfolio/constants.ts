export const APPFOLIO_AUTH_URL = 'https://app.appfolio.com/api/v1/oauth/authorize'
export const APPFOLIO_TOKEN_URL = 'https://app.appfolio.com/api/v1/oauth/token'

// Base API: https://{database}.appfolio.com/api/v1/
// The {database} subdomain is stored in credentials.extra.database
export const APPFOLIO_API_VERSION = 'api/v1'

// Rate limit: load-based, retry on 429 with Retry-After header
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 500
