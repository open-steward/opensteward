/**
 * Wise Platform API constants.
 *
 * Wise uses OAuth2 authorization code flow for user tokens and
 * client-credentials for application tokens.
 *
 * Docs: https://docs.wise.com/guides/developer/auth-and-security/oauth-2-setup
 */

/** Legacy API "servers": `https://api.wise.com` ("Production Environment"). */
export const API_BASE_URL = 'https://api.wise.com'
export const OAUTH_AUTHORIZE_URL = 'https://api.wise.com/oauth/authorize'
export const OAUTH_TOKEN_URL = 'https://api.wise.com/oauth/token'

/**
 * GET /v2/profiles — "List profiles for a user account"
 * (https://docs.wise.com/api-reference/legacy/profile/profilelist): "List of
 * all profiles belonging to user."
 */
export const PROFILES_PATH = '/v2/profiles'

/** GET /v1/transfers — "List transfers". */
export const TRANSFERS_PATH = '/v1/transfers'
/** GET /v1/transfers/{transferId} — "Get a transfer by ID". */
export const transferPath = (id: string): string => `/v1/transfers/${encodeURIComponent(id)}`

/**
 * Rows asked for when a caller names no limit (the router always does). Wise
 * documents no default or maximum for `limit` on GET /v1/transfers, so this is
 * our request size, not a Wise figure, and no `maxPageSize` is declared.
 */
export const DEFAULT_PAGE_SIZE = 100

/**
 * Default Wise scopes for partner integrations.
 */
export const DEFAULT_SCOPES = ['transfers', 'balances:read', 'user.basicdata:read']
