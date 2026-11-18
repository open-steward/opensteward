/**
 * Starshipit API constants.
 *
 * Authentication:
 *   StarShipIT-Api-Key       — account API token (Settings > API)
 *   Ocp-Apim-Subscription-Key — developer subscription key (developers.starshipit.com)
 *
 * Rate limits:
 *   Developer plan: 2 req/s
 *   Production plan: 20 req/s
 */

export const STARSHIPIT_API_BASE = 'https://api.starshipit.com/api/'

export const STARSHIPIT_SETTINGS_URL = 'https://app.starshipit.com/Members/Settings/API.aspx'

/** Production rate limit (requests per second). */
export const RATE_LIMIT_RPS = 20

export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 250

/**
 * GET /api/orders `page_size`: "Number of results to return (default: 500,
 * maximum: 500)" (https://api-docs.starshipit.com/, "Get Order(s)").
 */
export const MAX_ORDERS_PAGE_SIZE = 500

/**
 * GET /api/orders `status`: "The order status to filter orders for (default:
 * unshipped)", accepted values "Unshipped, Shipped, Printed".
 */
export const ORDER_STATUSES = ['Unshipped', 'Printed', 'Shipped'] as const
