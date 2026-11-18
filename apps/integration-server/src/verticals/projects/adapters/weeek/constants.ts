/**
 * Weeek REST API — constants.
 *
 * Production base URL: https://api.weeek.net/public/v1
 * There is no separate sandbox host.
 *
 * Authentication: long-lived personal API token sent as the
 * `Authorization: Bearer <token>` HTTP header.  Tokens are generated in
 * workspace settings under the "API" section.
 *
 * Pagination: `perPage` (default 50, max 100) + `offset` integer cursor.
 * List responses include a `hasMore` boolean.
 *
 * Docs: https://developers.weeek.net/
 */
export const API_BASE_URL = 'https://api.weeek.net/public/v1'

/** Where the user generates an API token (shown in the Connect Link help text). */
export const TOKEN_HELP_URL = 'https://app.weeek.net/settings/api'

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100
