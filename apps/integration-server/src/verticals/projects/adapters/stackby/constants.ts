/**
 * Stackby REST API constants.
 *
 * Stackby is a no-code spreadsheet/database platform. Its public API is
 * single-host SaaS — every request goes to
 * `https://stackby.com/api/betav1`, authenticated with a long-lived API
 * key via the `api-key` request header.
 *
 * API docs: https://documenter.getpostman.com/view/7317658/2sAYkGLz1i
 */

/** Base URL for all Stackby REST calls. */
export const API_BASE_URL = 'https://stackby.com/api/betav1'

/**
 * Default maximum records returned per list call.
 * Stackby accepts up to 1 000; we use 100 to stay well within rate limits.
 */
export const DEFAULT_PAGE_SIZE = 100

/** Where a user mints an API key (account settings → API). */
export const TOKEN_HELP_URL = 'https://stackby.com/account'
