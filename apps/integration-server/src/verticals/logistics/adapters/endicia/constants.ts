/**
 * SERA (the Stamps.com/Endicia REST API) base URLs, per the first-party
 * reference https://developer.stamps.com/rest-api/reference/serav1.html:
 *
 *   "#### Endpoint Base URLs
 *    ##### Sign-In/Authentication
 *    Staging: https://signin.testing.stampsendicia.com
 *    Production: https://signin.stampsendicia.com
 *
 *    ##### SERA
 *    Staging: https://api.testing.stampsendicia.com/sera
 *    Production: https://api.stampsendicia.com/sera"
 *
 *   "Every SERA endpoint contains a version number in the URL."
 *
 * API paths below are relative to `<base>/v1/`. The former base,
 * https://api.endicia.com/v1/, does not resolve.
 */
export const ENDICIA_API_BASE = 'https://api.stampsendicia.com/sera/v1/'
export const ENDICIA_SANDBOX_API_BASE = 'https://api.testing.stampsendicia.com/sera/v1/'

export const ENDICIA_SIGNIN_BASE = 'https://signin.stampsendicia.com'
export const ENDICIA_SANDBOX_SIGNIN_BASE = 'https://signin.testing.stampsendicia.com'

/**
 * Same reference, securitySchemes "SERA (Production)" / "SERA (Staging)",
 * authorizationCode flow:
 *
 *   "Authorization URL: https://signin.stampsendicia.com/authorize"
 *   "Token URL: https://signin.stampsendicia.com/oauth/token"
 *   "Refresh URL: https://signin.stampsendicia.com/oauth/token"
 *
 * (and the same paths on https://signin.testing.stampsendicia.com).
 */
export const ENDICIA_AUTHORIZE_PATH = '/authorize'
export const ENDICIA_TOKEN_PATH = '/oauth/token'

/**
 * "`scope` = `offline_access` (required to receive a refresh token)" — the
 * only scope the reference documents; `components.securitySchemes` lists
 * `"scopes": {}` for both environments.
 */
export const ENDICIA_OFFLINE_ACCESS_SCOPE = 'offline_access'

export const RATE_LIMIT_RPS = 20
