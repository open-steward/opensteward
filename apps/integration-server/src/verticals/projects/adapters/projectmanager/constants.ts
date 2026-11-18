/**
 * ProjectManager API constants.
 *
 * All requests go to a single production base URL regardless of workspace.
 * Authentication: Bearer token (API key generated in the workspace settings).
 * Pagination: OData $top / $skip query params.
 *
 * Docs: https://developer.projectmanager.com/getting-started/overview
 */

/** Production REST base URL */
export const API_BASE_URL = 'https://api.projectmanager.com'

/** Path prefix for all data endpoints */
export const API_PATH_PREFIX = '/api/data'

/** Default OData $top page size */
export const DEFAULT_PAGE_SIZE = 100
