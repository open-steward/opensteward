/**
 * Asana REST API constants.
 * Docs: https://developers.asana.com/reference
 */
export const API_BASE_URL = 'https://app.asana.com/api/1.0'
export const OAUTH_AUTHORIZE_URL = 'https://app.asana.com/-/oauth_authorize'
export const OAUTH_TOKEN_URL = 'https://app.asana.com/-/oauth_token'

export const DEFAULT_PAGE_SIZE = 100
/**
 * Asana's `limit` ceiling on every paginated endpoint: "The number of objects
 * to return per page. The value must be between 1 and 100."
 * (https://developers.asana.com/docs/pagination)
 */
export const MAX_PAGE_SIZE = 100
export const DEFAULT_SCOPES = ['default']
