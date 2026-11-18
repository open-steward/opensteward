/**
 * UseDesk REST API constants.
 *
 * Cloud base URL: https://secure.usedesk.com/uapi
 * Self-hosted instances use a customer-supplied base URL stored in
 * credentials.extra.baseUrl; falls back to the cloud URL.
 *
 * Docs: https://api.usedocs.com/
 */
export const API_BASE_URL = 'https://secure.usedesk.com/uapi'

/**
 * Pagination: UseDesk uses offset-based pagination in increments of 100.
 * The `offset` param selects the next page (offset=0 → rows 1-100, offset=1 → rows 101-200).
 */
export const DEFAULT_PAGE_SIZE = 100
