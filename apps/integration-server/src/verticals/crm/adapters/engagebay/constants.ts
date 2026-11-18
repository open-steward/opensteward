/** EngageBay API constants */

/** All EngageBay API requests are made against this base URL. */
export const BASE_URL = 'https://app.engagebay.com'

/**
 * Path prefix for all REST API endpoints.
 * Full URL pattern: `${BASE_URL}${API_PREFIX}/<resource>/<operation>`
 */
export const API_PREFIX = '/dev/api/panel'

/** Default page size for paginated list requests. Max allowed is 100. */
export const DEFAULT_PAGE_SIZE = 25

/**
 * Documented maximum page size: "Page size for paginated results (Max allowed
 * is 100)." (contacts and search; companies, deals and tasks state none, and
 * the adapter applies the same cap to them).
 */
export const MAX_PAGE_SIZE = 100
