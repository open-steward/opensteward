/**
 * VTEX REST API constants.
 *
 * VTEX REST APIs are hosted at:
 *   https://{accountName}.{environment}.com.br
 *
 * The standard production environment host is `vtexcommercestable`. The
 * account name is the store's VTEX account identifier (e.g. `mystore`).
 *
 * Auth is provided via two headers on every request:
 *   X-VTEX-API-AppKey   — the application key
 *   X-VTEX-API-AppToken — the application token
 *
 * Docs: https://developers.vtex.com/docs/guides/authentication
 */

/** Default environment suffix for production stores. */
export const DEFAULT_ENVIRONMENT = 'vtexcommercestable'

/** Orders API pagination: max 30 pages × 100 items per page documented. */
export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 100

/** Master Data v2 pagination: at most 100 documents per range request. */
export const MD_MAX_PAGE_SIZE = 100
