/**
 * Texada CloudLink REST API constants.
 *
 * Auth: x-api-key header POSTed to /auth → short-lived Bearer access token.
 * Base URL is tenant-scoped: https://use-api.cloudlink.texadasoftware.com/v1/{tenant}/
 * Pagination: zero-based ?page=N&size=N (max 1000 per page).
 */
export const API_BASE_URL = 'https://use-api.cloudlink.texadasoftware.com/v1'
export const DEFAULT_PAGE_SIZE = 500
