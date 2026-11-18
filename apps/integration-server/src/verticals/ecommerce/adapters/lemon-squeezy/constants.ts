/**
 * Lemon Squeezy REST API constants.
 *
 * Lemon Squeezy exposes a single versioned REST API at api.lemonsqueezy.com.
 * The API follows the JSON:API spec: responses wrap resources in a top-level
 * `data` envelope; list endpoints include `links` and `meta.page` for
 * page-based pagination.
 *
 * Docs: https://docs.lemonsqueezy.com/api
 */

export const BASE_URL = 'https://api.lemonsqueezy.com'
export const API_VERSION = 'v1'

export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 100
