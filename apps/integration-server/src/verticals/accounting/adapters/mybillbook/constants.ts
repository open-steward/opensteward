/**
 * myBillBook API constants.
 *
 * myBillBook (by FloBiz) is India's leading GST billing & accounting platform
 * for small and medium businesses.
 *
 * Auth: API key — generated in Settings > Integrations > API Keys.
 *   Sent as the `X-API-KEY` request header.
 *
 * Base URL: https://mybillbook.in/api/
 *
 * Pagination: query params `page` (1-indexed) and `limit`.
 * Response envelope for lists:
 *   { success: true, data: T[], total: number, page: number, limit: number }
 * Response envelope for single objects:
 *   { success: true, data: T }
 */

export const MYBILLBOOK_API_BASE = 'https://mybillbook.in/api/'

// Rate limit: conservative — 120 req/min
export const RATE_LIMIT_RPM = 120
export const MAX_PAGE_SIZE = 100
export const DEFAULT_PAGE_SIZE = 50
