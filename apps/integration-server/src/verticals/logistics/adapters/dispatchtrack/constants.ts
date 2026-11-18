/**
 * DispatchTrack (last-mile) API constants.
 *
 * DispatchTrack (formerly Beetrack) uses per-account subdomains for the
 * REST API:
 *
 *   https://<accountCode>.dispatchtrack.com/api/external/v1/
 *
 * Authentication is via an `api_key` query-string parameter attached to
 * every request.  The account code is stored in `credentials.extra.accountCode`
 * and the API key itself in `credentials.accessToken`.
 */

/** Fallback base URL used when the caller provides no accountCode. */
export const DISPATCHTRACK_API_BASE_TEMPLATE =
  'https://{accountCode}.dispatchtrack.com/api/external/v1/'

/** Where users can generate / retrieve their API keys. */
export const DISPATCHTRACK_DASHBOARD_URL =
  'https://app.dispatchtrack.com/settings'

/** Conservative rate limit (requests / second). */
export const RATE_LIMIT_RPS = 10

/** Default and maximum page sizes for list operations. */
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100
