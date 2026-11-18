/**
 * BoondManager API constants.
 *
 * Docs: https://doc.boondmanager.com/api-externe/
 * Base URL: https://ui.boondmanager.com/api
 */

/** Production REST base URL — used for all tenants (no separate sandbox). */
export const BASE_URL = 'https://ui.boondmanager.com/api'

/**
 * Auth header name for JWT token authentication.
 * BoondManager expects the pre-built JWT in this header, NOT `Authorization: Bearer`.
 * Sending the token via `Authorization: Bearer` causes the API to return 422
 * "Signature verification failed".
 */
export const JWT_HEADER = 'X-Jwt-Client-Boondmanager'

/** Default page size for list endpoints. BoondManager allows up to 500 via `maxResults`. */
export const DEFAULT_PAGE_SIZE = 30

/** API resource paths. */
export const PATHS = {
  contacts: '/contacts',
  companies: '/companies',
  opportunities: '/opportunities',
  actions: '/actions',
} as const
