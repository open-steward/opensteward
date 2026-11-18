/**
 * SuperOffice CRM Online endpoints.
 *
 * Login host — https://docs.superoffice.com/en/developer-portal/getting-started/app-envir.md,
 * "Environment matrix": Development `https://sod.superoffice.com`, Stage (QA)
 * `https://qaonline.superoffice.com`, Production `https://online.superoffice.com`.
 * This adapter has no environment key, so it uses production.
 *
 * Paths — https://docs.superoffice.com/en/api/authentication/online/sign-in-user/auth-code-flow:
 *   "GET Request https://sod.superoffice.com/login/common/oauth/authorize?"
 *   "POST https://sod.superoffice.com/login/common/oauth/tokens?"
 *   "https://{ env }.superoffice.com/login/common/oauth/tokens?" (refresh)
 */
export const LOGIN_HOST = 'https://online.superoffice.com'
export const OAUTH_AUTH_URL = `${LOGIN_HOST}/login/common/oauth/authorize`
export const OAUTH_TOKEN_URL = `${LOGIN_HOST}/login/common/oauth/tokens`

/** Same page, parameter table: scope — "yes — Must be `openid`." */
export const OAUTH_SCOPE = 'openid'

/**
 * The tenant's REST base comes from the id_token, never from a fixed host.
 * https://docs.superoffice.com/en/api/authentication/online/validate-security-tokens:
 *   "The claims in the following table are all prefixed with http://schemes.superoffice.net/identity/"
 *   "webapi_url … The URL to a tenant REST web services."
 *   example: "http://schemes.superoffice.net/identity/webapi_url" : "https://sod.superoffice.com/Cust26759/api/"
 */
export const WEBAPI_URL_CLAIM = 'http://schemes.superoffice.net/identity/webapi_url'
