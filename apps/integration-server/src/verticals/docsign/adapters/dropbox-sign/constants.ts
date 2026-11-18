/**
 * Dropbox Sign (formerly HelloSign) REST API constants.
 *
 * Docs: https://developers.hellosign.com/api/reference/
 */
export const API_BASE_URL = 'https://api.hellosign.com/v3'

export const OAUTH_AUTHORIZE_URL = 'https://app.hellosign.com/oauth/authorize'
export const OAUTH_TOKEN_URL = 'https://app.hellosign.com/oauth/token'

export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 100

export const DEFAULT_SCOPES = ['basic_account_access', 'signature_request_access', 'template_access', 'account_access']
