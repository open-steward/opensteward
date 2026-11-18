/**
 * Box Sign REST API constants.
 *
 * Box Sign lives inside Box's REST API at api.box.com/2.0/sign_requests
 * and api.box.com/2.0/sign_templates. OAuth lives at account.box.com.
 *
 * Docs: https://developer.box.com/reference/resources/sign-request/
 */
export const API_BASE_URL = 'https://api.box.com/2.0'

export const OAUTH_AUTHORIZE_URL = 'https://account.box.com/api/oauth2/authorize'
export const OAUTH_TOKEN_URL = 'https://api.box.com/oauth2/token'

export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 1000

/**
 * Default Box scopes. `root_readwrite` grants access to the Box Sign
 * resources alongside Box Files.
 */
export const DEFAULT_SCOPES = ['root_readwrite']
