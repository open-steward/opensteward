/**
 * FastSpring API constants.
 *
 * Docs: https://developer.fastspring.com/reference/api-overview
 */

/** No version prefix — every resource hangs directly off this host. */
export const API_BASE_URL = 'https://api.fastspring.com'

/**
 * List endpoints (`GET /products`, `/orders`, `/accounts`) default to 50
 * per page per the documented `limit` query parameter default.
 * https://developer.fastspring.com/reference/list-all-orders
 */
export const DEFAULT_PAGE_SIZE = 50

/**
 * FastSpring does not document an upper bound for `limit`. We cap it
 * defensively: the adapter's list flow is "fetch a page of ids, then GET
 * each id individually" (no documented bulk-by-id fetch — see
 * https://developer.fastspring.com/reference/retrieve-a-product, which
 * explicitly supports only one `product_path` per request), so a page of
 * `limit` ids costs `1 + limit` calls. Capping at 100 keeps one page (101
 * calls) comfortably under the documented rate limit of 250 calls/IP/minute
 * even after a couple of 429 retries.
 */
export const MAX_PAGE_SIZE = 100

/**
 * FastSpring requires a `User-Agent` header on every request ("Mandatory.
 * Identify your integration to prevent request rejection.") —
 * https://developer.fastspring.com/reference/api-overview
 */
export const USER_AGENT = 'OpenSteward/fastspring-adapter (+https://opensteward.io)'
