/**
 * Jumpseller REST API constants.
 *
 * Base URL: https://api.jumpseller.com/v1
 * Auth: OAuth 2 Authorization Code flow (access_token in Bearer header).
 * Access tokens expire in 1 hour; refresh tokens do not expire.
 *
 * Docs: https://jumpseller.com/support/api/
 *       https://jumpseller.com/support/oauth-2/
 */

/** Jumpseller REST API base URL — all paths are appended with `.json`. */
export const API_BASE_URL = 'https://api.jumpseller.com/v1'

/** OAuth 2 authorization endpoint (accounts subdomain). */
export const OAUTH_AUTHORIZE_URL = 'https://accounts.jumpseller.com/oauth/authorize'

/** OAuth 2 token endpoint — used for both code exchange and refresh. */
export const OAUTH_TOKEN_URL = 'https://accounts.jumpseller.com/oauth/token'

/** Default number of objects returned per list request. Jumpseller default is 50, max 100. */
export const DEFAULT_PAGE_SIZE = 50

/** Maximum page size Jumpseller will honour. */
export const MAX_PAGE_SIZE = 100

/**
 * Default OAuth 2 scopes for a full-featured install.
 * Jumpseller exposes read/write pairs per resource; callers can narrow via
 * `JumpsellerAdapterConfig.scopes`.
 */
export const DEFAULT_SCOPES = [
  'read_products',
  'write_products',
  'read_orders',
  'write_orders',
  'read_customers',
  'write_customers',
  'read_store',
]
