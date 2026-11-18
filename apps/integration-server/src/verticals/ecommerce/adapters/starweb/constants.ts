/**
 * Starweb Shop API v2 constants.
 *
 * The Starweb REST API is hosted per-shop under
 * `https://{shopId}.starwebserver.se/api/v2`. The `shopId` comes from the
 * merchant's Starweb account. There is no separate sandbox environment —
 * Starweb is a hosted SaaS and test environments are provisioned as
 * separate shop accounts.
 *
 * Auth: OAuth 2.0 client-credentials flow.
 *   Token endpoint: POST https://{shopId}.starwebserver.se/api/v2/token
 *   Header:         Authorization: Bearer <access_token>
 *
 * Docs: https://api-docs.starweb.se/
 */

export const API_VERSION = 'v2'

/**
 * The API returns at most 100 items per page; the default page size we
 * request from the Starweb API.
 */
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100

/**
 * Build the base URL for a given shop.
 */
export function shopBaseUrl(shopId: string): string {
  return `https://${shopId}.starwebserver.se/api/${API_VERSION}`
}

/**
 * Build the OAuth2 token endpoint for a given shop.
 */
export function tokenUrl(shopId: string): string {
  return `${shopBaseUrl(shopId)}/token`
}
