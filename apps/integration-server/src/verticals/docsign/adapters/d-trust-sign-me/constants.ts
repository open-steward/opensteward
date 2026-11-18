/**
 * D-Trust sign-me (Bundesdruckerei, Germany) REST API constants.
 *
 * Public docs partial. Endpoint paths best-known.
 */
export const API_BASE_URL = 'https://api.sign-me.de/v1'
export const OAUTH_AUTHORIZE_URL = 'https://login.sign-me.de/oauth/authorize'
export const OAUTH_TOKEN_URL = 'https://login.sign-me.de/oauth/token'
export const DEFAULT_PAGE_SIZE = 100
export const DEFAULT_SCOPES = ['signature:read', 'signature:write']
