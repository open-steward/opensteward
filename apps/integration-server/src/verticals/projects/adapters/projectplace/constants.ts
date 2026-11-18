/**
 * Projectplace API constants.
 *
 * REST API base: https://api.projectplace.com
 * OAuth2: authorize at https://api.projectplace.com/oauth2/authorize,
 *         token exchange/refresh at https://api.projectplace.com/oauth2/access_token
 *
 * Docs: https://service.projectplace.com/apidocs/
 */
export const API_BASE_URL = 'https://api.projectplace.com'
export const OAUTH_AUTHORIZE_URL = 'https://api.projectplace.com/oauth2/authorize'
export const OAUTH_TOKEN_URL = 'https://api.projectplace.com/oauth2/access_token'
export const DEFAULT_PAGE_SIZE = 100
/**
 * GET /3/conversations/comments `count`: "Defaults to 100 entries (which is
 * also the maximum allowable pagination count). You can specify any count
 * between 1 and 100."
 */
export const COMMENTS_MAX_COUNT = 100
/** Projectplace OAuth2 does not use scopes — pass empty array. */
export const DEFAULT_SCOPES: string[] = []
