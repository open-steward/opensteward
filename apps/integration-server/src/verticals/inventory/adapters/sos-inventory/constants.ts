/**
 * SOS Inventory REST API v2 constants.
 *
 * Base URL: https://api.sosinventory.com/api/v2
 * Auth: OAuth 2.0 authorization-code flow.
 * Pagination: `start` (a 1-based row number) + `maxresults`; envelope:
 * { count, totalCount, data[], status, message }
 */
export const API_BASE_URL = 'https://api.sosinventory.com/api/v2'
export const OAUTH_AUTHORIZE_URL = 'https://api.sosinventory.com/oauth2/authorize'
export const OAUTH_TOKEN_URL = 'https://api.sosinventory.com/oauth2/token'
export const DEFAULT_PAGE_SIZE = 100

/**
 * The most rows one list call returns. `maxresults`: "The maximum number of
 * results you want to return.  The default is 200, the maximum value
 * allowed." and `start`: "The API limits results to a max of 200 results per
 * call." (https://developer.sosinventory.com/apidoc, both item and location)
 */
export const MAX_PAGE_SIZE = 200

/**
 * Scopes required for read access to inventory data.
 * SOS Inventory uses a single scope for full account access.
 */
export const SCOPES = ['read']
