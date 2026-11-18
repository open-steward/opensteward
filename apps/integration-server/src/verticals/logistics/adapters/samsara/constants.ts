export const SAMSARA_API_BASE = 'https://api.samsara.com'
export const SAMSARA_DASHBOARD_URL = 'https://cloud.samsara.com'

/**
 * GET /fleet/routes `limit`: "Default and max for this value is 512 objects."
 * https://developers.samsara.com/reference/fetchroutes
 */
export const SAMSARA_ROUTES_MAX_LIMIT = 512

/** Minimum milliseconds before expiry at which we consider the token stale. */
export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000

/** Samsara enforces 5 req/s on most fleet endpoints. */
export const RATE_LIMIT_RPS = 5

/**
 * Samsara route stop completion statuses mapped to canonical TrackingEventStatus.
 * Samsara does not use carrier-style "tracking" statuses; we derive them from
 * route + stop state fields.
 */
export const ROUTE_STATE_MAP: Record<string, string> = {
  unstarted: 'PRE_TRANSIT',
  en_route: 'IN_TRANSIT',
  arrived: 'IN_TRANSIT',
  skipped: 'FAILURE',
  departed: 'IN_TRANSIT',
  completed: 'DELIVERED',
}

export const STOP_STATE_MAP: Record<string, string> = {
  unvisited: 'PRE_TRANSIT',
  arrived: 'IN_TRANSIT',
  departed: 'DELIVERED',
  skipped: 'FAILURE',
}
