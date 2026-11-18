/**
 * Octadesk API constants.
 *
 * Base URL: https://api.octadesk.services
 * Auth: API token (73-char key) in Authorization header + agent email in
 * octa-agent-email header.
 *
 * Docs: https://developers.octadesk.com/reference/authentication
 */

export const API_BASE_URL = 'https://api.octadesk.services'

/** Default page size for list endpoints. Octadesk uses page + limit pagination. */
export const DEFAULT_PAGE_SIZE = 50
