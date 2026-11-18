/**
 * GOFRUGAL RetailEasy eCommerce Integration API constants.
 *
 * This is NOT a cloud API — it is served by the merchant's own RetailEasy
 * installation (a "WebReporter" service), documented at a fixed local base
 * of `http://localhost:8482/WebReporter/api/v1/` that merchants expose over
 * HTTPS with their own certificate so an online store can reach it.
 *
 * Docs: https://community.gofrugal.com/portal/en/kb/gofrugalretaileasy/ecommerce-integration/api-integration/articles/api-integration
 */

/** Path suffix every WebReporter deployment mounts the API under. */
export const WEB_REPORTER_API_PATH = '/WebReporter/api/v1'

/**
 * Only `GET /salesOrders` documents pagination: "A maximum of 250 sales
 * orders alone can be retrieved in one time," with `page`/`limit` query
 * params (`limit=50` shown as the example page size). `GET /items` documents
 * no pagination at all — the adapter pages that whole collection locally
 * (`pageLocally`), so it needs no ceiling of its own.
 */
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 250
