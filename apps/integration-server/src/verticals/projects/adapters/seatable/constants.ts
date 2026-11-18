/**
 * SeaTable API constants.
 *
 * SeaTable exposes two URL layers:
 *   - Account/workspace layer:  https://cloud.seatable.io/api/v2.1/…
 *   - Base (row/table) layer:   https://cloud.seatable.io/api-gateway/api/v2/dtables/{base_uuid}/…
 *
 * Both are served from the same cloud host; the api-gateway prefix was
 * introduced in v4.4 and is the only supported path since v5.3.
 *
 * Auth (https://api.seatable.com/reference/authentication): account-level
 * calls need an Account-Token; base-level calls need a Base-Token, which the
 * base API-Token is exchanged for via GET /api/v2.1/dtable/app-access-token/.
 */

export const CLOUD_BASE_URL = 'https://cloud.seatable.io'

/** Account & workspace API root */
export const ACCOUNT_API_PATH = '/api/v2.1'

/** Base-operations API root (rows, tables, comments) */
export const GATEWAY_API_PATH = '/api-gateway/api/v2'

/** Default rows per page for list operations */
export const DEFAULT_PAGE_SIZE = 100

/**
 * Largest `limit` GET /api-gateway/api/v2/dtables/{base_uuid}/rows/ accepts.
 * https://api.seatable.com/reference/listrows: `limit` "Number of rows that
 * should be returned. 1000 by default." (schema minimum 1, maximum 1000).
 */
export const ROWS_MAX_LIMIT = 1000

/** Default start offset for row pagination */
export const DEFAULT_ROW_START = 0
