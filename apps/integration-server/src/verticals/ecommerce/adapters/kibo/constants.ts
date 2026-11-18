/**
 * Kibo Commerce constants.
 *
 * Kibo is a composable commerce platform (formerly Mozu). It exposes a
 * multi-tenant REST API under `https://{tenant}.mozu.com/api` or the
 * shared gateway `https://api.mozu.com`. All endpoints are versioned
 * under `/api/...` and return JSON envelopes with `items`, `totalCount`,
 * `pageSize`, and `startIndex` for collections.
 *
 * Authentication: OAuth2 client-credentials flow against
 * `https://home.mozu.com/api/platform/applications/authtickets/oauth`.
 */

export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 200

/** Token is treated as valid for this many seconds before re-fetching. */
export const TOKEN_LIFETIME_SECONDS = 3300

/**
 * OAuth2 token endpoint (shared across all tenants).
 */
export const TOKEN_ENDPOINT =
  'https://home.mozu.com/api/platform/applications/authtickets/oauth'

/**
 * Default base URL pattern. The tenant subdomain should be substituted at
 * runtime: `https://{tenant}.mozu.com`.
 */
export const DEFAULT_BASE_URL = 'https://api.mozu.com'

export const CONTENT_TYPE = 'application/json'

/** Kibo REST API version prefix embedded in all paths. */
export const API_PREFIX = '/api'
