/**
 * Epos Now API constants.
 *
 * Epos Now is an EU-focused cloud POS with 100k+ venues.
 * REST API v4 with OAuth2 or API-key authentication.
 */

export const BASE_URL = 'https://api.eposnowhq.com/api/v4'

export const DEFAULT_PAGE_SIZE = 200
export const MAX_PAGE_SIZE = 200

/** OAuth2 token endpoint. */
export const TOKEN_URL = 'https://api.eposnowhq.com/api/v4/Token'

/** OAuth2 authorize endpoint. */
export const AUTH_URL = 'https://api.eposnowhq.com/api/v4/OAuth/Authorize'
