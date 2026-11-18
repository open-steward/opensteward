/**
 * Faveo Helpdesk REST API constants (v3).
 *
 * Faveo is a self-hosted product — every installation has its own base URL.
 * Tenants supply their Faveo URL (e.g. https://helpdesk.acme.com) at credential
 * time; the adapter appends v3/api/<resource> for all calls.
 *
 * Auth: the caller first exchanges user_name/email + password for a JWT token
 * via POST v3/api/login, then all subsequent requests include the token as
 * `Authorization: Bearer <token>` header.
 * We store the JWT as accessToken in Credentials and the tenant URL in extra.baseUrl.
 *
 * Response envelope (v3): { success: boolean, message: string, data: <payload> }
 */

/** Fallback demo base URL — tenants always provide their own via credentials.extra.baseUrl */
export const DEMO_BASE_URL = 'https://www.stablehelpdeskc.faveodemo.com'

/**
 * Path prefix of the v3 agent/admin API, relative to the tenant base URL.
 * https://developers.faveohelpdesk.com/how-to-pass-oauth2-token-in-api-version-3/ :
 * "CURLOPT_URL => \"https://{your-faveo-url}/v3/api/api-end-point\""
 */
export const API_V3_PATH = '/v3/api'

/**
 * The v3 user list, which is NOT under the /v3/api prefix.
 * https://developers.faveohelpdesk.com/get-users-list/ : "URL: v3/ user-export-data"
 */
export const USER_EXPORT_PATH = '/v3/user-export-data'

/** Authentication endpoint (relative to tenant base URL, no leading slash) */
export const AUTH_PATH = 'v3/api/login'
