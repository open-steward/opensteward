/**
 * Vivantio REST API constants.
 *
 * The base URL is regional; NA01 is the primary production host.
 * Customers may be on different regional hosts (eu01, au01, etc.) —
 * the apiBaseUrl credential field lets them override it.
 *
 * Auth: HTTP Basic (username + password), passed as
 *   Authorization: Basic <base64(username:password)>
 * Vivantio also supports supplying this as a pre-encoded token directly.
 */
export const API_BASE_URL_DEFAULT = 'https://webservices-na01.vivantio.com'
export const API_PATH_PREFIX = '/api'
export const DEFAULT_PAGE_SIZE = 50
