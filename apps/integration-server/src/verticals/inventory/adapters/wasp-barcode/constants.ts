/**
 * Wasp Barcode Technologies — InventoryCloud
 *
 * Base URL is tenant-specific: https://{tenant}.waspinventorycloud.com
 * The tenant subdomain is provided by the user at credential time.
 * All API endpoints are under the /public-api prefix.
 */
export const API_BASE_PATH = '/public-api'
export const DEFAULT_PAGE_SIZE = 100
export const MAX_BATCH_SIZE = 500
export const RATE_LIMIT_PER_MINUTE = 200
