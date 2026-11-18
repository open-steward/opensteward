export const API_BASE_URL = 'https://api.mavenlink.com/api/v1'
export const OAUTH_AUTHORIZE_URL = 'https://app.mavenlink.com/oauth/authorize'
export const OAUTH_TOKEN_URL = 'https://app.mavenlink.com/oauth/token'
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 200
// Kantata OX OAuth tokens are not scoped per-resource; the application is
// granted access to all data the authenticated user can see.
export const DEFAULT_SCOPES: string[] = []
