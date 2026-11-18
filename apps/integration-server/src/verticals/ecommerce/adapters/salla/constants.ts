/**
 * Salla Merchant API constants.
 *
 * REST base URL: https://api.salla.dev/admin/v2
 * OAuth2 endpoints live on accounts.salla.sa.
 *
 * Access tokens expire after 14 days; refresh tokens are single-use and
 * expire after 1 month. Include `offline_access` scope to receive a refresh
 * token.
 *
 * Docs: https://docs.salla.dev/
 */

export const SALLA_API_BASE = 'https://api.salla.dev/admin/v2'

export const SALLA_AUTH_BASE = 'https://accounts.salla.sa/oauth2'
export const SALLA_AUTHORIZE_URL = `${SALLA_AUTH_BASE}/auth`
export const SALLA_TOKEN_URL = `${SALLA_AUTH_BASE}/token`

/**
 * Salla pagination uses page numbers. The default page size and a sensible
 * maximum are defined here so they can be referenced from both the client
 * and the adapter index.
 */
export const DEFAULT_PAGE_SIZE = 15
export const MAX_PAGE_SIZE = 100

/**
 * Salla's documented `per_page` ceiling: "Note that the maximum value for the
 * `per_page` query parameter is `60`" (https://docs.salla.dev/pagination.md).
 * Used by listLocations; `MAX_PAGE_SIZE` above predates it and is not applied
 * by `client.list` (the caller's `per_page` overrides it).
 */
export const SALLA_MAX_PER_PAGE = 60

/**
 * Default OAuth2 scopes for full merchant data access. Callers can narrow
 * this via `SallaAdapterConfig.scopes`.
 */
export const DEFAULT_SCOPES = [
  'offline_access',
  'products.read_write',
  'orders.read_write',
  'customers.read_write',
  'categories.read_write',
  'shippings.read_write',
  'specialoffers.read_write',
  'webhooks.read_write',
]
