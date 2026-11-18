/**
 * Blueink eSignature REST API (v2) constants.
 *
 * Blueink authenticates server-to-server requests with a static Private API
 * key sent as `Authorization: Token <key>` — there is no OAuth
 * Authorization-Code flow for backend use, so the adapter collects the key
 * through the Connect Link credential form.
 *
 * Blueink is single-host (no separate sandbox host); test traffic is flagged
 * per-bundle via `is_test` rather than routed to a different base URL.
 *
 * Docs: https://developer.blueink.com/docs/esignature-api/
 * Auth: https://developer.blueink.com/docs/esignature-api/authentication/
 */
export const API_BASE_URL = 'https://api.blueink.com/api/v2'

/**
 * Blueink list endpoints are page-based: `page` (1-indexed) + `per_page`.
 * The default page size is 50 and the documented maximum is 100.
 */
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100

/**
 * Custom pagination summary header:
 *   `<current page>,<total pages>,<per page>,<total results>`
 * (e.g. `2,4,50,176`). Surfaced here for reference; pagination is driven by
 * the `page`/`per_page` request params.
 */
export const PAGINATION_HEADER = 'x-blueink-pagination'
