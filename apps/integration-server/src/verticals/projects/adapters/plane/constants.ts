// Plane Cloud REST API. Self-hosted instances expose the same paths under
// their own domain; this adapter targets Plane Cloud.
// Docs: https://developers.plane.so/api-reference/introduction
export const API_BASE_URL = 'https://api.plane.so/api/v1'
export const OAUTH_AUTHORIZE_URL = 'https://api.plane.so/auth/o/authorize-app/'
export const OAUTH_TOKEN_URL = 'https://api.plane.so/auth/o/token/'
export const DEFAULT_PAGE_SIZE = 100
/** "The maximum allowed value specified by the server is 100." (per_page) */
export const MAX_PAGE_SIZE = 100
export const DEFAULT_SCOPES = ['read']
