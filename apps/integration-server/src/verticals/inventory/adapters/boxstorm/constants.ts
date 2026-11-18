/**
 * Boxstorm (Fishbowl Advanced cloud) REST API constants.
 *
 * Boxstorm is the cloud-hosted edition of Fishbowl Advanced.
 * Auth: Bearer token in Authorization header; obtained via POST /api/login
 *       or supplied directly as a pre-generated API token.
 * Pagination: pageNumber + pageSize query params; response envelope has
 *             totalCount / totalPages / pageNumber / pageSize / results[].
 */
export const API_BASE_URL = 'https://app.boxstorm.com/api'
export const DEFAULT_PAGE_SIZE = 100
