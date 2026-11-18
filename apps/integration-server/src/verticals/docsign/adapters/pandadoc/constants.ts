/**
 * PandaDoc REST API constants.
 *
 * Docs: https://developers.pandadoc.com/reference/about
 */
export const API_BASE_URL = 'https://api.pandadoc.com/public/v1'

export const OAUTH_AUTHORIZE_URL = 'https://app.pandadoc.com/oauth2/authorize'
export const OAUTH_TOKEN_URL = 'https://api.pandadoc.com/oauth2/access_token'

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100

export const DEFAULT_SCOPES = ['read+write']

/**
 * The document audit trail is served under /public/v2, not the v1 base above:
 * `GET /public/v2/documents/{document_id}/audit-trail`, paged by `limit`
 * ("minimum": 1, "maximum": 100, "default": 20) and `offset`.
 * https://developers.pandadoc.com/reference/list-document-audit-trail
 */
export const API_V2_BASE_URL = 'https://api.pandadoc.com/public/v2'
export const AUDIT_TRAIL_MAX_LIMIT = 100
