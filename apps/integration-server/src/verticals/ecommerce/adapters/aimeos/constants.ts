/**
 * Aimeos REST API constants.
 *
 * Aimeos is a Laravel/Symfony ecommerce framework. This adapter targets the
 * Aimeos JSON:API endpoint (`{baseUrl}/api`).
 *
 * Auth: Bearer token. Static API tokens are generated in the Aimeos admin
 * panel or via OAuth2. Credentials are configured directly via /v1/connections.
 *
 * Base URL: stored in credentials.extra.baseUrl (e.g. https://myshop.example.com).
 * API base: {baseUrl}/api
 *
 * Reference: https://aimeos.org/docs/latest/infrastructure/rest-api/
 */

/** JSON:API Content-Type per spec */
export const CONTENT_TYPE = 'application/vnd.api+json'

export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 100

/** Aimeos REST API path appended to baseUrl */
export const API_PATH = '/api'

/**
 * Aimeos product status codes.
 *   -2 = archived
 *   -1 = review
 *    0 = disabled
 *    1 = enabled
 */
export const AIMEOS_STATUS = {
  ARCHIVED: -2,
  REVIEW: -1,
  DISABLED: 0,
  ENABLED: 1,
} as const

/**
 * Aimeos order status codes.
 *   0  = unfinished
 *   1  = waiting
 *   2  = progress
 *   3  = dispatch
 *   4  = delivered
 *   5  = lost
 *   6  = refused
 *   7  = returned
 *  -1  = canceled
 */
export const AIMEOS_ORDER_STATUS = {
  UNFINISHED: 0,
  WAITING: 1,
  PROGRESS: 2,
  DISPATCH: 3,
  DELIVERED: 4,
  LOST: 5,
  REFUSED: 6,
  RETURNED: 7,
  CANCELED: -1,
} as const
