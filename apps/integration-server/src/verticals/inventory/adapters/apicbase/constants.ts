/**
 * Apicbase REST API v2 constants.
 *
 * Auth: OAuth2 Bearer token (access token in Authorization header).
 * Base URL: https://api.apicbase.com/api/v2
 * Pagination: DRF-style { count, next, previous, results[] } with ?page + ?page_size params.
 */
export const API_BASE_URL = 'https://api.apicbase.com/api/v2'
export const DEFAULT_PAGE_SIZE = 100
/**
 * The largest `page_size` Apicbase serves: "In most cases, the maximum amount
 * of items that can be requested is **200**."
 * (https://developers.apicbase.com/reference/pagination)
 */
export const MAX_PAGE_SIZE = 200
/**
 * The largest `page_size` GET /inventory/outlets/{outlet_id}/count_events/
 * serves: "The number of results per page. Defaults to 10, capped at 100."
 * (https://developers.apicbase.com/reference/get-top-counts)
 */
export const MAX_COUNT_EVENTS_PAGE_SIZE = 100
