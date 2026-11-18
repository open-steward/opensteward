/**
 * "Production: https://api.transfi.com" — https://docs.transfi.com/docs/api-concepts.md
 *
 * Every v3 path carries its own `/v3` prefix, so the base is the bare host.
 * Sandbox is a separate host with separate credentials; the adapter has no
 * environment key, so it talks to production only.
 */
export const API_BASE_URL = 'https://api.transfi.com'

/**
 * "List endpoints support `limit` (default 10, max 100) and `page` (from 1)."
 * — https://docs.transfi.com/docs/api-concepts.md
 */
export const MAX_PAGE_SIZE = 100
export const DEFAULT_PAGE_SIZE = 10

export const ORDERS_PATH = '/v3/orders'
export const INDIVIDUAL_USERS_PATH = '/v3/users/individual'
export const BUSINESS_USERS_PATH = '/v3/users/business'
