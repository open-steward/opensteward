/**
 * IZBERG (iceberg.technology) Merchant REST API constants.
 *
 * IZBERG is a SaaS marketplace platform. Its merchant API lives under
 * `https://api.iceberg.technology/v1/` (production) or
 * `https://api.sandbox.iceberg.technology/v1/` (sandbox). All endpoints are
 * plural resource names without a trailing version segment (the version is in
 * the base URL).
 *
 * Auth: `Authorization: Bearer {seller authorization token}` (public spec
 * `bearerAuth`, `{ "type": "http", "scheme": "bearer" }`).
 *
 * Pagination: `?limit=N&offset=N` on GET list endpoints. The response
 * envelope is `{ objects: T[], meta: { total_count, limit, offset, next, previous } }`.
 */

export const API_VERSION = 'v1'

/** Production REST base URL (no trailing slash). */
export const PROD_BASE_URL = 'https://api.iceberg.technology'

/** Sandbox REST base URL (no trailing slash). */
export const SANDBOX_BASE_URL = 'https://api.sandbox.iceberg.technology'

export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100

/**
 * Per-resource `limit` ceilings. Tastypie clamps a larger `limit` silently, so
 * a page asked for past it comes back short, and an offset strided by the size
 * asked for skips the rows in between. The public spec documents "Maximum
 * `limit` is 40." only on GET /v1/product/; these were observed on the live
 * API (2026-09-23: `?limit=1000` echoed `meta.limit` 40 on productoffer, 50 on
 * user, 100 on merchant_order, refund and transaction).
 */
export const RESOURCE_MAX_PAGE_SIZE = {
  'productoffer/': 40,
  'user/': 50,
  'merchant_order/': MAX_PAGE_SIZE,
  'refund/': MAX_PAGE_SIZE,
  'transaction/': MAX_PAGE_SIZE,
} as const

export type IzbergListPath = keyof typeof RESOURCE_MAX_PAGE_SIZE
