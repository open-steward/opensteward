/**
 * Crunchtime (net-chef.com) REST API constants.
 *
 * Auth: 4-header credential scheme — authenticationtoken (provisioned by Crunchtime),
 *       sitename, userid, password.
 * Base URLs differ by environment; credentials carry the sitename so the client
 * can target production vs. test dynamically.
 */
export const API_BASE_URL = 'https://webservices.net-chef.com'
export const DEFAULT_PAGE_SIZE = 100
