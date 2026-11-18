/**
 * "Base url: https://api.trolley.com", "API Version: v1" — the request URL is
 * "https://api.trolley.com/v1/…" (https://developers.trolley.com/api/).
 */
export const API_BASE_URL = 'https://api.trolley.com'
export const API_VERSION_PREFIX = '/v1'

/** The caller's page size when a call names no limit. */
export const DEFAULT_PAGE_SIZE = 50

/**
 * `pageSize` on every "List All" operation: "Specifies how many items you want
 * each page to have. Defaults to 10, maximum 1000" (developers.trolley.com/api,
 * Pagination).
 */
export const MAX_PAGE_SIZE = 1000
