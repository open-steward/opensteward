/**
 * Vikunja REST API (v1).
 *
 * Vikunja is a self-hostable, open-source to-do list application. Every
 * instance exposes a REST API at `<instance>/api/v1`. The public try instance
 * is at https://try.vikunja.io, which is used here as the default base URL.
 *
 * Users who run their own instance should override `API_BASE_URL` via the
 * credential form (the Connect Link `customForm` helper exposes a base URL
 * field for this purpose).
 *
 * Authentication uses a long-lived API token passed in the
 * `Authorization: Bearer <token>` header. Tokens are minted under
 * Settings > API Tokens in the Vikunja web UI.
 *
 * Pagination: list endpoints accept `page` (1-based, default 1) and
 * `per_page` (default 50). Response headers carry `x-pagination-total-pages`
 * and `x-pagination-result-count`.
 *
 * Docs: https://vikunja.io/docs/api-documentation/
 */

/** Default base URL pointing at the public try instance. Self-hosted users
 * supply their own instance URL through the credential form. */
export const DEFAULT_API_BASE_URL = 'https://try.vikunja.io/api/v1'

/** URL where users generate API tokens. */
export const TOKEN_HELP_URL = 'https://vikunja.io/docs/api-documentation/'

/** Page size used for list requests. Vikunja's default is 50; we request
 * a larger batch to reduce round-trips. */
export const DEFAULT_PAGE_SIZE = 50

/**
 * `per_page` sent on every paged list: `service.maxitemsperpage`'s default.
 * The spec says per_page "is limited by the configured maximum of items per
 * page" (https://try.vikunja.io/api/v1/docs.json); an instance configured
 * lower clamps it silently, which the adapter survives by following the
 * `x-pagination-total-pages` header instead of trusting this size.
 */
export const MAX_ITEMS_PER_PAGE = 50
