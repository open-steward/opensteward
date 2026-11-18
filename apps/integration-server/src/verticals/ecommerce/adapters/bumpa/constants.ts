/**
 * Bumpa REST API constants.
 *
 * Bumpa exposes a public REST API at api.getbumpa.com. Authentication is
 * via a Bearer API key issued from the Bumpa web app under Store → API key.
 *
 * API is versioned at /v1. Responses follow Laravel-style pagination with
 * `current_page`, `per_page`, `total`, `last_page`, and `next_page_url`.
 *
 * Docs: https://docs.bumpa.io
 */

/** Public production base URL (no trailing slash). */
export const BASE_URL = 'https://api.getbumpa.com'

/** API path prefix. */
export const API_PREFIX = '/v1'

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100
