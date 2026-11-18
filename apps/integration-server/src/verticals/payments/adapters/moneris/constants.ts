/**
 * "https://api.moneris.io … Production server (uses live data)"; the sandbox
 * is "https://api.sb.moneris.io … Sandbox server (uses test data)"
 * (servers of the Moneris API 2.15.1 OpenAPI definition, e.g.
 * https://developer.moneris.com/moneris-api/reference/getcustomers.md).
 */
export const API_BASE_URL = 'https://api.moneris.io'

/**
 * `Api-Version` is a required header ("The endpoint's API Version. Must be
 * provided through the headers section."); its schema has
 * `"default": "2026-08-14"`.
 */
export const API_VERSION = '2026-08-14'

/** `limit`: "Maximum number of items to return in the response." `"default": 10, "minimum": 1, "maximum": 20`. */
export const LIST_DEFAULT_LIMIT = 10
export const LIST_MAX_LIMIT = 20

/** `created_to` "must be no more than 1 day later than `created_from` date." */
export const WINDOW_MS = 86_400_000
