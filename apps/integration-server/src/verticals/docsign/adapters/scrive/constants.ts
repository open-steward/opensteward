/**
 * Scrive Document API v2 constants.
 *
 * https://apidocs.scrive.com/ "General Information":
 *   "Host & base path  scrive.com/api/v2/"
 * and "OAuth2":
 *   "Authorization endpoint: <oauth2_endpoint>.scrive.com/oauth2/auth
 *    Token endpoint: <oauth2_endpoint>.scrive.com/oauth2/token
 *    OAuth2 Endpoints  https://scrive.com - https://oauth2.scrive.com"
 *
 * The previous api.scrive.com host does not resolve (NXDOMAIN).
 */
export const API_BASE_URL = 'https://scrive.com/api/v2'
export const OAUTH_AUTHORIZE_URL = 'https://oauth2.scrive.com/oauth2/auth'
export const OAUTH_TOKEN_URL = 'https://oauth2.scrive.com/oauth2/token'

/**
 * GET /documents/list `max`: "optional default: 100 Maximum number of
 * documents to return. Server may cap to a lower value." No upper bound is
 * documented, so the caller's limit is sent as-is. When the server caps it,
 * ScriveAdapter#pageDocuments advances the offset by the rows returned and
 * asks again for the rest of the caller's page.
 */
export const DEFAULT_PAGE_SIZE = 100

/**
 * OAuth2 scopes, https://apidocs.scrive.com/ "OAuth2" > "Available scopes":
 *   "doc:create - ability to create and update document
 *    doc:check - ability to read and list documents
 *    doc:send - ability to start documents
 *    full - full access to the account and documents
 *    offline_access - ability to refresh the OAuth2 token when it has expired"
 * The authorize and token URLs above are the OAuth2 ones, so these are the
 * OAuth2 scope names, not the OAuth1 privilege names (DOC_CREATE, DOC_CHECK,
 * ...). offline_access is what lets refreshCredentials work.
 */
export const DEFAULT_SCOPES = ['doc:create', 'doc:check', 'doc:send', 'offline_access']
