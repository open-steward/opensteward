/**
 * Shelf.nu (shelf-nu) Mobile REST API constants.
 *
 * Auth: Supabase JWT Bearer token, sent as Authorization: Bearer <token>.
 * The organisation ID must be passed as ?orgId=<id> on every request.
 * Production base URL: https://app.shelf.nu
 *
 * Pagination: page (1-based) + perPage. Each route clamps perPage itself, and
 * the ceilings differ: GET /api/mobile/assets takes at most 50, GET
 * /api/mobile/locations at most 100 (route source in github.com/Shelf-nu/shelf.nu,
 * apps/webapp/app/routes/api+/mobile+/).
 */
export const API_BASE_URL = 'https://app.shelf.nu'
/**
 * GET /api/mobile/assets: `Math.min(50, Math.max(1, rawPerPage))`, where
 * rawPerPage is `parseInt(perPage || "20", 10)`. A larger request comes back
 * as 50 rows, so a full page has to be judged at 50, not at the size asked for.
 */
export const ASSETS_MAX_PAGE_SIZE = 50
/**
 * GET /api/mobile/locations:
 * `Math.min(100, Math.max(1, parseInt(perPage || "50", 10) || 50))`.
 */
export const LOCATIONS_MAX_PAGE_SIZE = 100
