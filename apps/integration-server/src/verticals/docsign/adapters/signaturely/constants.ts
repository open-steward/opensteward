/**
 * Signaturely REST API constants.
 *
 * Signaturely is a US e-signature platform with a single hosted environment.
 * There is no separate sandbox host — a request is flagged test vs. live with
 * the per-call `testMode` body flag (test requests never send real emails or
 * consume credits). Every call is HTTPS-only.
 *
 * Auth is a single long-lived API key sent verbatim in the `Authorization`
 * header as `Api-Key <key>` (note: this is NOT a Bearer token). The key is
 * minted in the account's API settings. The Connect Link flow collects it via
 * the shared `simpleApiKey` template (wired in index.ts); the header is
 * assembled in client.ts. There is no OAuth flow and no token refresh.
 *
 * Docs: https://docs.signaturely.com/
 */

/** Single hosted API base. `api/v1` is the current stable version. */
export const API_BASE_URL = 'https://api.signaturely.com/api/v1'

/** Connect-form landing page where customers mint an API key. */
export const API_KEY_SETTINGS_URL = 'https://app.signaturely.com/settings/api'

/**
 * Document/template lists paginate with `page` (1-indexed) + `limit`; both are
 * required by those endpoints. Responses wrap the rows in
 * `{ data, currentPage, totalPages, totalItems, itemsPerPage, itemCount }`.
 */
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100
