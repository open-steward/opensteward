/**
 * Zoho Sign REST API constants.
 *
 * Zoho Sign exposes a single REST host at sign.zoho.com (regional clones
 * exist — .eu / .in / .com.au — but the .com host is the canonical
 * documented default). OAuth lives on accounts.zoho.com.
 *
 * Docs: https://www.zoho.com/sign/api/
 */
export const API_BASE_URL = 'https://sign.zoho.com/api/v1'

export const OAUTH_AUTHORIZE_URL = 'https://accounts.zoho.com/oauth/v2/auth'
export const OAUTH_TOKEN_URL = 'https://accounts.zoho.com/oauth/v2/token'

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100

/**
 * Default Zoho Sign scopes. ALL grants list+read+write on the resource set.
 */
export const DEFAULT_SCOPES = ['ZohoSign.documents.ALL', 'ZohoSign.templates.ALL']
