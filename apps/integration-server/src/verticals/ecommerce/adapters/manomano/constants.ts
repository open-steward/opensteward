/**
 * ManoMano Partners REST API constants.
 *
 * Base URL: https://partnersapi.manomano.com
 * Auth:     x-api-key header — API key generated in the ManoMano Toolbox
 *           (Settings → API keys).
 *
 * Rate limit: 200 requests / hour / IP. Exceeding returns HTTP 429.
 *
 * Pagination: page-based. Query params: `page` (1-indexed, default 1) + `limit`
 *             (default 50, capped at 100).
 *
 * Docs: https://www.manomano.dev/
 */

export const API_BASE_URL = 'https://partnersapi.manomano.com'

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100

/**
 * Rate-limit window: 200 requests / hour / IP.
 * Kept as documentation; actual throttling is handled by the client's
 * withRetry loop on HTTP 429.
 */
export const RATE_LIMIT_RPH = 200
