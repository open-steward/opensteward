/**
 * LiveAgent REST API v3 constants.
 *
 * Every LiveAgent instance is self-hosted on a per-tenant subdomain:
 *   https://{subdomain}.ladesk.com/api/v3
 *
 * Auth: `apikey` request header (NOT a query parameter).
 * Pagination: `_page` (1-based, default 1) + `_perPage` (default 10); no
 * documented maximum. DEFAULT_PAGE_SIZE is used only when a caller names no limit.
 */
export const API_BASE_URL_TEMPLATE = 'https://{subdomain}.ladesk.com/api/v3'
export const DEFAULT_PAGE_SIZE = 100
