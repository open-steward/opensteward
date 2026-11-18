/**
 * GetAccept REST API constants.
 *
 * GetAccept exposes a REST API at api.getaccept.com/v1 with an OAuth-style
 * `Authorization: Bearer <accessToken>` header. The token endpoint lives
 * at /v1/auth (not the conventional /oauth/token path).
 *
 * Docs: https://developers.getaccept.com
 */
export const API_BASE_URL = 'https://api.getaccept.com/v1'

export const OAUTH_AUTHORIZE_URL = 'https://app.getaccept.com/oauth/authorize'
export const OAUTH_TOKEN_URL = 'https://api.getaccept.com/v1/auth'

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100

export const DEFAULT_SCOPES: string[] = []
