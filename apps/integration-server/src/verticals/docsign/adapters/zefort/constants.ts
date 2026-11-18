/**
 * Zefort REST API constants.
 *
 * Zefort is a contract-management + e-signature platform. The API for any
 * Zefort instance lives under that instance's own hostname behind the
 * `/api` prefix (there is no separate API host) — the sandbox, the two
 * shared production regions (EU/US), and dedicated/on-prem instances are
 * selected purely by hostname. The Connect Link form collects the host
 * alongside the API key (see auth.ts); `DEFAULT_API_BASE_URL` is only the
 * fallback used when no host was supplied.
 *
 * Auth is HTTP Basic with the API key as the username and an empty password
 * (assembled in client.ts). All calls are HTTPS-only.
 *
 * Docs: https://developers.zefort.com/docs/introduction/
 */

/** Sandbox instance — the default when the customer supplies no host. */
export const DEFAULT_API_BASE_URL = 'https://sandbox.zefort.com/api'

/** Shared production regions, offered as host presets on the Connect form. */
export const EU_API_BASE_URL = 'https://my.zefort.com/api'
export const US_API_BASE_URL = 'https://us.zefort.com/api'

/** Where customers mint an API key (Account settings → API keys). */
export const API_KEY_SETTINGS_URL = 'https://sandbox.zefort.com/settings/api-keys'

/**
 * Pinned API version sent as the `Zefort-Version` header so response shapes
 * stay stable across Zefort's dated releases.
 */
export const ZEFORT_API_VERSION = '2023-11-01'

/**
 * Lists paginate with `page` (1-indexed) + `page_size`. Responses wrap rows
 * in a `{ page, page_size, last_page, count, next, previous, results }`
 * envelope.
 */
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 100
