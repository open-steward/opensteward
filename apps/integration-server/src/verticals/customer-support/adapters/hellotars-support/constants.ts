/**
 * HelpDesk (by LiveChat) REST API constants.
 *
 * Production base URL: https://api.helpdesk.com/v1
 * OAuth 2.0 authorization is shared with the LiveChat Accounts service.
 * Docs: https://api.helpdesk.com/docs
 */

export const API_BASE_URL = 'https://api.helpdesk.com/v1'

/** OAuth2 endpoints — shared LiveChat Accounts service */
export const OAUTH_AUTHORIZE_URL = 'https://accounts.livechat.com/'
export const OAUTH_TOKEN_URL = 'https://accounts.livechat.com/v2/token'

/** Default page size when the caller names none */
export const DEFAULT_PAGE_SIZE = 50

/** Default OAuth2 scopes for read-only access */
export const DEFAULT_SCOPES = ['accounts--my:ro']

/**
 * GET /v1/tickets page-size ceiling. https://api.helpdesk.com/docs (Tickets):
 * "`pageSize` | number | Number of results per page (default = 20, max = 100)".
 */
export const MAX_TICKET_PAGE_SIZE = 100
