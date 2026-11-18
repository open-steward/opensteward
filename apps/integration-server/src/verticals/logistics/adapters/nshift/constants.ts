/**
 * nShift (formerly Unifaun) Delivery API constants.
 *
 * Base URL: https://api.unifaun.com/rs-extapi/v1
 * Auth:     HTTP Basic Auth — API key ID as username, Secret ID as password.
 *           Combined keys (16+24 chars, dash-separated) split on the first dash.
 */

export const NSHIFT_API_BASE = 'https://api.unifaun.com/rs-extapi/v1/'

export const NSHIFT_DASHBOARD_URL = 'https://portal.nshift.com/settings/api-keys'

/**
 * GET /shipments-history's fixed page size. RAML
 * (https://api.unifaun.com/rs-extapi/v1/documentation/root-resource-v1.raml):
 * "page: ... Number of page you need to see. Each page contains 50 records."
 */
export const NSHIFT_HISTORY_PAGE_SIZE = 50

export const RATE_LIMIT_RPS = 5
