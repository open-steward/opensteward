/**
 * Shift4Shop (formerly 3dcart) REST API constants.
 *
 * The REST API is exposed at `https://apirest.3dcart.com/3dCartWebAPI/v1`.
 * Auth uses two static headers: `PrivateKey` (private API key) and
 * `Token` (public API token / SecureURL key).
 */

export const BASE_URL = 'https://apirest.3dcart.com/3dCartWebAPI/v1'

export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 100

/**
 * Documented batch sizes, per endpoint (https://apirest.3dcart.com/v1/getting-started/index.html,
 * Rate Limits → Batch size): "This is the maximum number of records that can
 * be retrieved in a single request." "GET Orders: 300", "GET Products: 200",
 * "All Others: 500".
 */
export const ORDERS_BATCH_SIZE = 300
export const PRODUCTS_BATCH_SIZE = 200
export const OTHER_BATCH_SIZE = 500
