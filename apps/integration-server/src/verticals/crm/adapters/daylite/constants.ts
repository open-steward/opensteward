/** Daylite REST API constants.
 *
 * OAuth2 flow lives at www.marketcircle.com/account/oauth/*
 * All data API calls go to api.marketcircle.net/v1/.
 *
 * Docs: https://developer.daylite.app/reference/getting-started
 */

export const DAYLITE_BASE_URL = 'https://api.marketcircle.net/v1'
export const DAYLITE_AUTH_URL = 'https://www.marketcircle.com/account/oauth/authorize'
export const DAYLITE_TOKEN_URL = 'https://www.marketcircle.com/account/oauth/token'

/** Default page size used for list endpoints. */
export const DAYLITE_DEFAULT_PAGE_SIZE = 25

/**
 * Default OAuth2 scopes requested during the authorization flow.
 * Operators can override via the Connect Link mint form.
 */
export const DEFAULT_DAYLITE_SCOPES: readonly string[] = [
  'read',
  'write',
]
