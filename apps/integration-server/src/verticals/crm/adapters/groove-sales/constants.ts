/**
 * Groove by Clari sales CRM — API constants.
 *
 * Groove (acquired by Clari) is a sales engagement and CRM platform distinct
 * from GrooveHQ (helpdesk).  The REST v1 API is served under api.groove.co.
 * OAuth2 endpoints are hosted at app.groove.co.
 *
 * REST base: https://api.groove.co/v1
 * Auth docs: https://developer.groove.co/
 */

export const GROOVE_BASE_URL = 'https://api.groove.co/v1'

/** OAuth2 authorization endpoint. */
export const GROOVE_AUTH_URL = 'https://app.groove.co/oauth/authorize'

/** OAuth2 token endpoint (authorization_code + refresh_token). */
export const GROOVE_TOKEN_URL = 'https://app.groove.co/oauth/token'

/** Maximum results per page the API will accept. */
export const GROOVE_MAX_PAGE_SIZE = 50

/** Default page size used when the caller does not specify a limit. */
export const GROOVE_DEFAULT_PAGE_SIZE = 25

/**
 * Groove does not publish formal scope names; the OAuth2 grant is
 * account-wide.  Passing an empty list (or omitting the scope param)
 * requests the default level of access.
 */
export const DEFAULT_GROOVE_SCOPES: readonly string[] = []
