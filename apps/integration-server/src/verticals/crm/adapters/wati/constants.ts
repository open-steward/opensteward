/**
 * Wati adapter constants.
 *
 * Wati uses per-tenant base URLs of the form:
 *   https://live-mt-server.wati.io/{tenantId}
 *
 * The full base URL (including tenant path segment) is stored at
 * runtime in credentials.extra.baseUrl and passed to the client.
 *
 * Docs: https://docs.wati.io/reference/introduction
 */

/** Maximum page size accepted by the Wati v1/v3 API. */
export const DEFAULT_PAGE_SIZE = 20
