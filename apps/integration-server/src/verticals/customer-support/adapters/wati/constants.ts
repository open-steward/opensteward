/**
 * WATI REST API constants.
 *
 * Host: v3 calls go to the origin of the stored endpoint URL, without its
 * tenant path ("do not add a tenant ID to the path",
 * https://docs.wati.io/reference/introduction.md); see client.ts.
 *
 * Docs: https://docs.wati.io/reference/introduction
 */

/** Default page size for paginated list endpoints (max 100 per WATI docs). */
export const DEFAULT_PAGE_SIZE = 100

/**
 * v3 list endpoints: page_size "Number of items per page (max 100)."
 * (https://docs.wati.io/reference/contacts_getcontactlist.md)
 */
export const MAX_PAGE_SIZE = 100

/** WATI API v3 path prefix. */
export const API_V3_PREFIX = '/api/ext/v3'
