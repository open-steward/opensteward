/**
 * pdfFiller REST API constants.
 *
 * pdfFiller exposes a single hosted API (no separate sandbox host); the
 * developer portal at developers.pdffiller.com gates app creation and the
 * OAuth authorize step. All resource paths nest under the v2 base.
 *
 * Docs: https://docs.pdffiller.com/ — API host https://api.pdffiller.com/v2
 */

export const API_BASE_URL = 'https://api.pdffiller.com/v2'

/**
 * Authorization-Code Grant endpoints. pdfFiller issues authorization codes
 * through the developer portal's API-access screen; tokens are minted at the
 * v2 token endpoint.
 */
export const OAUTH_AUTHORIZE_URL = 'https://developers.pdffiller.com/api_access'
export const OAUTH_TOKEN_URL = 'https://api.pdffiller.com/v2/oauth/token'

export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 100

/**
 * pdfFiller's OAuth grants are app-scoped rather than scope-string driven;
 * the authorize step does not require a `scope` parameter. The list is kept
 * empty so the auth URL omits it.
 */
export const DEFAULT_SCOPES: string[] = []
