/**
 * "WorkBoard's production server API root is https://www.myworkboard.com/wb/apis."
 * (https://apidocs.myworkboard.com/openapi.json, info.description). Paths below
 * carry the `/wb/apis` prefix.
 */
export const API_BASE_URL = 'https://www.myworkboard.com'
export const OAUTH_AUTHORIZE_URL = 'https://www.myworkboard.com/wb/oauth/authorize'
export const OAUTH_TOKEN_URL = 'https://www.myworkboard.com/wb/oauth/token'
export const OAUTH_REVOKE_URL = 'https://www.myworkboard.com/wb/oauth/revoke/'
/**
 * The documented default `limit` of every WorkBoard list ("The default value
 * is 15."). No maximum is documented, so it is also the fixed upstream page
 * size for GET /goal, whose `limit` unit the docs leave ambiguous.
 */
export const WB_DEFAULT_LIMIT = 15
export const DEFAULT_SCOPES = ['all']
