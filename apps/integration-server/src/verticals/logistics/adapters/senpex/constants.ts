/**
 * Senpex Delivery API v4 constants.
 *
 * Authentication: `clientid` + `secretid` request headers (provided by Senpex support).
 * Base URL differs between sandbox and production environments.
 */

export const SENPEX_API_BASE_PRODUCTION = 'https://api.production.senpex.com/api/restfull/v4'
export const SENPEX_API_BASE_SANDBOX = 'https://api.sandbox.senpex.com/api/restfull/v4'

export const SENPEX_DASHBOARD_URL = 'https://dev.senpex.com'

export const RATE_LIMIT_RPS = 10
export const DEFAULT_PAGE_SIZE = 12

/**
 * Transport type IDs accepted by the Senpex API.
 */
export const TRANSPORT_TYPE = {
  CAR: 1,
  SUV: 2,
  PICKUP_TRUCK: 3,
  LARGE_VAN: 4,
} as const

/**
 * Package size IDs accepted by the Senpex API.
 * Small: 1–25 lbs, Medium: 26–50 lbs, Large: 51–70 lbs,
 * Heavy Load: 71–150 lbs, Big but lightweight: >150 lbs
 */
export const PACK_SIZE = {
  SMALL: 1,
  MEDIUM: 2,
  LARGE: 3,
  HEAVY_LOAD: 4,
  BIG_LIGHTWEIGHT: 5,
} as const
