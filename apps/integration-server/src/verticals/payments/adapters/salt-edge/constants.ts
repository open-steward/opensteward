/**
 * Salt Edge Account Information API (v6) constants.
 *
 * Salt Edge exposes a single host for both pending (sandbox) and live data —
 * the environment is selected by the App-id / Secret pair, not by the URL.
 * "Pending" / "test" providers are flagged per-provider rather than served
 * from a separate base URL.
 *
 * Docs: https://docs.saltedge.com/v6/api_reference/
 */
export const API_BASE_URL = 'https://www.saltedge.com/api/v6'

/** Items per page. Salt Edge accepts 100–1000; defaults to 100 when omitted. */
export const DEFAULT_PAGE_SIZE = 100
export const MIN_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 1000
