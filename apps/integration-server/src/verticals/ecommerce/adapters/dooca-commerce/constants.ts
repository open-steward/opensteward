/**
 * Dooca Commerce REST API constants.
 *
 * Dooca Commerce exposes a single production REST API at api.dooca.store.
 * There is no versioned path prefix — all resources live directly under the
 * base URL. Tokens are static Bearer tokens generated from the Dooca admin
 * panel under Aplicativos → API.
 *
 * Pagination: page-based with `page` and `per_page` (alias `limit`) query
 * params. Responses include a `meta` object with `current_page`, `last_page`,
 * `total`, and `per_page`, and a `links` object with `first`, `last`, `prev`,
 * `next` URL strings.
 */
export const API_BASE_URL = 'https://api.dooca.store'

export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 100
