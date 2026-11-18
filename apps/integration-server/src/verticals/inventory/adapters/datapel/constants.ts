/**
 * Datapel WMS (Breeze DataServer) REST API constants.
 *
 * The Breeze DataServer is customer-hosted. The base URL is configurable per
 * tenant and stored in credentials.extra.serverUrl. For Datapel Cloud.WMS
 * tenants the server URL takes the form https://<tenant>.datapelwms.net/json.
 *
 * Auth: HTTP Basic → token exchange. Subsequent calls carry:
 *   Authorization: <base64(user:pass)>  (the static authorisation code)
 *   AuthToken: <session_token>          (24-hour session token)
 *
 * The newer cloud REST API is documented at https://api.datapel.com/ and uses
 * OData query conventions; endpoints here target that surface.
 */

/**
 * Fallback base URL used when no tenant-specific server is provided.
 * Production tenants must supply credentials.extra.serverUrl.
 */
export const API_BASE_URL_DEFAULT = 'https://api.datapelwms.net/json'

/** OData-style page size. Breeze accepts `$top` / `pagesize`. */
export const DEFAULT_PAGE_SIZE = 100

/** Token TTL in ms (24 hours as documented). */
export const TOKEN_TTL_MS = 23 * 60 * 60 * 1000
