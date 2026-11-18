/**
 * Orderbot REST API constants.
 *
 * Production base URL confirmed from open-source gateway implementation:
 *   https://github.com/workarea-commerce/workarea-orderbot
 *
 * Auth flow: POST /accesstoken with HTTP Basic (email:password) → JSON { token }
 * All subsequent requests use: Authorization: Bearer <token>
 * Pagination: query param `page` (1-based); total pages returned in
 *   response header `x-total-pages`.
 */
export const API_BASE_URL = 'https://api-beta.orderbot.com'
export const DEFAULT_PAGE_SIZE = 100
export const TOKEN_TTL_MS = 4 * 60 * 1000 // 4 min (server expires at 5 min)
