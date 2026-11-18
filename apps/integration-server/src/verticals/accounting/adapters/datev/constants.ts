// DATEV uses OpenID Connect; authorize/token are discovered via
// https://login.datev.de/openid/.well-known/openid-configuration
export const DATEV_AUTH_URL = 'https://login.datev.de/openid/authorize'
export const DATEV_TOKEN_URL = 'https://login.datev.de/openid/token'
// accounting-clients API base URL (production).  Requests are routed via
// the client-id path segment: .../v2/clients/{client-id}/...
export const DATEV_API_BASE = 'https://accounting-clients.api.datev.de/platform/v2'

export const RATE_LIMIT_RPM = 100
export const MAX_PAGE_SIZE = 100
export const DEFAULT_PAGE_SIZE = 50
