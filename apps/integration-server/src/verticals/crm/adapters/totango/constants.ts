/**
 * Totango API base URL (US).
 *
 * Search API (accounts and users), Search API (events) and Touchpoints API all
 * say: "For US services, please use https://api.totango.com" and "For EU
 * services, please use https://api-eu1.totango.com". The adapter has no region
 * setting, so EU tenants are not reachable yet.
 * https://support.totango.com/hc/en-us/articles/204174135-Search-API-accounts-and-users
 */
export const BASE_URL = 'https://api.totango.com'

/**
 * Totango Customer Data Hub (CDH) ingestion API base URL.
 * Used for creating/updating accounts and users via the ingest endpoint.
 */
export const CDH_BASE_URL = 'https://int-hub.totango.com'

/**
 * Largest page every list endpoint takes. Search API (accounts and users):
 * "The max value for count is 1000." Search API (events): "The max. value for
 * count is 1000".
 */
export const MAX_PAGE_SIZE = 1000

/**
 * Search API (accounts and users): "There is a maximum of 10,000 total records
 * that can be accessed through this API."
 */
export const SEARCH_RECORD_CAP = 10_000
