/** Catalyst Software REST API v1 constants.
 *  Docs: https://help.catalyst.io/hc/en-us/articles/34021477455508-Catalyst-API-v1
 */

/**
 * Production base URL. Documented verbatim: "Base URL: https://api.catalyst.io",
 * with paths such as "GET /accounts" directly under it (no /v1 segment).
 */
export const BASE_URL = 'https://api.catalyst.io'

/** Default page size (matches Catalyst default of 25). */
export const DEFAULT_PAGE_SIZE = 25

/** Maximum page size allowed by the Catalyst API. */
export const MAX_PAGE_SIZE = 100

/** Global rate limit: 100 calls per minute per customer instance. */
export const RATE_LIMIT_PER_MINUTE = 100
