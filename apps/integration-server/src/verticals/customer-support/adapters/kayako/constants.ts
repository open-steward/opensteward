/**
 * Kayako REST API v1 constants.
 * Base URL is per-tenant: https://{subdomain}.kayako.com/api/v1
 * Subdomain is stored in credentials.extra.subdomain.
 */
export const API_BASE_URL_TEMPLATE = 'https://{subdomain}.kayako.com/api/v1'
export const DEFAULT_PAGE_SIZE = 100
/** Upper bound on offset pages walked when a method must fetch a whole collection. */
export const MAX_WALK_PAGES = 100
