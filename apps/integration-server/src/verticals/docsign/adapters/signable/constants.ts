/**
 * Signable REST API constants.
 *
 * Signable is a UK e-signature platform with a single hosted environment.
 * There is no separate sandbox host — test vs production is selected by
 * which API key is used (a "test" key never sends real emails or consumes
 * credits). Every call is HTTPS-only; the API rejects plain HTTP.
 *
 * Auth is HTTP Basic: the API key is the username and a literal `x` is the
 * password (the password is accepted but not validated). The Connect Link
 * flow collects the key via the shared `simpleApiKey` template (wired in
 * index.ts); the Basic header is assembled in client.ts.
 *
 * Docs: https://developers.signable.app/
 */

/** Single hosted API base. v1 is the current stable version. */
export const API_BASE_URL = 'https://api.signable.co.uk/v1'

/** Connect-form landing page where customers mint an API key. */
export const API_KEY_SETTINGS_URL = 'https://signable.app/company-settings/developer'

/**
 * Lists paginate with `offset` (0-indexed) + `limit`. The API caps `limit`
 * at 50 — requesting more silently returns 10, so we clamp to 50.
 */
export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 50
