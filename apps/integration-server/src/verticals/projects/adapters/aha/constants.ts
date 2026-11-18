/**
 * Aha! REST API constants.
 *
 * Aha! is multi-tenant on per-account subdomains: `https://<account>.aha.io`.
 * The REST API lives under `/api/v1` on the account host. The OAuth2 authorize
 * and token endpoints are served from the same host family; `secure.aha.io` is
 * Aha!'s documented shared host that works for any account.
 *
 * The concrete account host is captured at auth time and stored on
 * `credentials.extra.apiBaseUrl`; the client falls back to `secure.aha.io`.
 *
 * Docs: https://www.aha.io/api , https://www.aha.io/api/oauth2
 */
export const OAUTH_HOST = 'https://secure.aha.io'
export const OAUTH_AUTHORIZE_URL = `${OAUTH_HOST}/oauth/authorize`
export const OAUTH_TOKEN_URL = `${OAUTH_HOST}/oauth/token`

/** Default account host used when no account-specific host is on the credentials. */
export const DEFAULT_API_BASE_URL = 'https://secure.aha.io/api/v1'
export const API_PATH_PREFIX = '/api/v1'

/** Pagination: Aha! allows up to 200 records per page (default 30). */
export const DEFAULT_PAGE_SIZE = 200
export const MAX_PAGE_SIZE = 200

/**
 * Aha! OAuth2 access tokens do not carry scopes — access mirrors the
 * authorizing user's role — so no `scope` parameter is sent.
 */
export const DEFAULT_SCOPES: string[] = []
