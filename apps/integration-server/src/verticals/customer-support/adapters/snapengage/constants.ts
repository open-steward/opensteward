/**
 * SnapEngage API constants.
 *
 * Base URL: https://www.snapengage.com/api/v2
 * Auth:     Authorization: {api_token}  (token-based, not Bearer)
 * Org ID:   provided by user, embedded in every path as /{orgId}/...
 */
export const API_BASE_URL = 'https://www.snapengage.com/api/v2'

/** SnapEngage returns at most 100 cases per page. */
export const DEFAULT_PAGE_SIZE = 100
