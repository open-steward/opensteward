/**
 * Mezan (mezan.sa) — Saudi cloud-accounting platform.
 *
 * Public REST API documentation is not openly published; the API is
 * available on the Advanced plan.  Base URL and path conventions follow
 * the standard mezan.sa app sub-domain.
 *
 * Auth: Bearer token (API key issued in-app) sent as `Authorization: Bearer <key>`.
 *
 * Pagination: `page` (1-based) + `per_page` query parameters.
 * Response envelope: `{ data: [...], meta: { total, per_page, current_page, last_page } }`.
 */

export const MEZAN_API_BASE = 'https://app.mezan.sa/api/v1/'

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100
