/**
 * Yousign REST API v3 constants.
 *
 * Docs: https://developers.yousign.com/reference/oas-specification
 */
export const API_BASE_URL = 'https://api.yousign.app/v3'
export const SANDBOX_BASE_URL = 'https://api-sandbox.yousign.app/v3'

export const OAUTH_AUTHORIZE_URL = 'https://yousign.app/oauth/authorize'
export const OAUTH_TOKEN_URL = 'https://yousign.app/oauth/token'

export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 100

export const DEFAULT_SCOPES = ['signature_requests:read', 'signature_requests:write']
