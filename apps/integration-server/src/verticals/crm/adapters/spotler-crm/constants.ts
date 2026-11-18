/**
 * The CRM API v4 host. https://support.reallysimplesystems.com/api-v4/:
 * "enter https://apiv4.reallysimplesystems.com/accounts into the 'Curl
 * Command URL' field". Object paths hang off the root, with no version prefix.
 */
export const BASE_URL = 'https://apiv4.reallysimplesystems.com'
export const OAUTH_AUTH_URL = 'https://app.reallysimplesystems.com/oauth/authorize'
export const OAUTH_TOKEN_URL = 'https://api.reallysimplesystems.com/oauth/token'
/** "All GET requests are limited to 100 records at a time and defaulted to 10." */
export const MAX_PAGE_SIZE = 100
export const DEFAULT_PAGE_SIZE = 10
