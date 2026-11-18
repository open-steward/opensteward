/**
 * Tyro Connect constants.
 *
 * Every Tyro Connect OpenAPI spec declares one production server:
 *   servers: - url: https://api.tyro.com/connect  (description: Production)
 *   https://docs.connect.tyro.com/_spec/api-explorer/reporting/1.0/index.yaml
 *
 * Auth is the OAuth 2.0 client-credentials grant against the authorisation
 * server's `/oauth/token`:
 *   "To obtain a JWT, make a request to the `/oauth/token` endpoint of the
 *    authorisation server, setting `audience` to `https://app.connect.tyro`
 *    for an App integration"
 *   https://docs.connect.tyro.com/docs/getting-started/authentication/client-credentials.md
 *   Server: https://auth.connect.tyro.com
 *   https://docs.connect.tyro.com/specs/authentication/client-credentials.md
 */

export const API_BASE_URL = 'https://api.tyro.com/connect'
export const TOKEN_URL = 'https://auth.connect.tyro.com/oauth/token'
/** "`https://app.connect.tyro` for an App integration" (client-credentials.md). */
export const APP_AUDIENCE = 'https://app.connect.tyro'

/**
 * Reporting transactions `limit`: "minimum: 1, maximum: 2000"
 * (reporting/1.0/index.yaml). The adapter always asks for the maximum and cuts
 * the caller's page out of the rows with pageByRows, so a walk costs the
 * fewest requests.
 */
export const TRANSACTIONS_PAGE_LIMIT = 2000

/**
 * "Data is only available for dates within the past 3 years"
 * (https://docs.connect.tyro.com/docs/business-operations/reporting/overview.md).
 * The lower bound of an unfiltered walk.
 */
export const RETENTION_YEARS = 3
