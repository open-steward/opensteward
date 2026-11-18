/**
 * ShipsGo API constants.
 *
 * Base URL:     https://api.shipsgo.com/api/
 * Auth:         API key passed as query param `authCode` on every request
 * Rate limit:   100 req/min (shared across all company users)
 * Docs:         https://shipsgo.com/ocean/container-tracking-api
 *               https://api.shipsgo.com/docs/v2/
 */

export const SHIPSGO_API_BASE = 'https://api.shipsgo.com/api/'

/**
 * Base URL for the ShipsGo v2 REST API.
 * Authentication: X-Shipsgo-User-Token header (same API key as v1 authCode param).
 * Docs: https://api.shipsgo.com/docs/v2/
 */
export const SHIPSGO_API_V2_BASE = 'https://api.shipsgo.com/v2'

/** ShipsGo dashboard URL — used as fallback auth URL for the Connect Link form. */
export const SHIPSGO_DASHBOARD_URL = 'https://shipsgo.com/dashboard/tracking-api'

/** Requests per minute allowed per company (shared quota). */
export const RATE_LIMIT_RPM = 100

/** Default page size when listing shipments. */
export const DEFAULT_PAGE_SIZE = 20

/** Maximum page size allowed by the API. */
export const MAX_PAGE_SIZE = 100
