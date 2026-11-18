/**
 * Membrain REST API constants.
 *
 * Source: https://www.membrain.com/developers/api-documentation (fetched 2026-09-25).
 *
 *   Entry Point: "The REST API is accessed via the following URL:
 *   https://*.membrain.com/API/v2/"
 *
 * The `*` is the customer's own Membrain instance, so the host is built per
 * connection from `credentials.extra.subdomain` (see client.ts).
 */
export const MEMBRAIN_DOMAIN = 'membrain.com'
export const API_PATH = '/API/v2'

/**
 * Rows in one upstream page of a paged collection.
 *
 * Paging: "Many requests return a paged collection with a maximum of 1000
 * entries per page (default is 100 per page), in these cases you need to
 * supply ?From=N in the query to access entries starting from index N."
 *
 * The docs name no page-size parameter, so every upstream page is the
 * default 100 and the caller's pages are cut out of them with `pageByRows`.
 */
export const UPSTREAM_PAGE_SIZE = 100
