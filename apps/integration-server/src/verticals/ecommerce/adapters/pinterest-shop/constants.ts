/**
 * Pinterest API constants.
 *
 * Pinterest is a visual discovery and catalog platform. The Catalogs API
 * lives at api.pinterest.com/v5 and is authenticated via OAuth2.
 *
 * Auth: OAuth2 authorization-code flow. Access tokens expire after ~1 hour;
 * refresh tokens are long-lived.
 *
 * Slug: `pinterest-shop` (directory and platform identifier).
 */

/** Pinterest REST API v5 base URL. */
export const BASE_URL = 'https://api.pinterest.com/v5'

/** Pinterest OAuth2 authorization endpoint. */
export const AUTH_URL = 'https://www.pinterest.com/oauth/'

/** Pinterest OAuth2 token endpoint. */
export const TOKEN_ENDPOINT = 'https://api.pinterest.com/v5/oauth/token'

/** Default list page size. */
export const DEFAULT_PAGE_SIZE = 25

/**
 * Largest `page_size` a bookmark-paged v5 list accepts
 * (`Pinterest.Lib.BookmarkParams.page_size`: default 25, maximum 250).
 */
export const MAX_PAGE_SIZE = 250

/** Required OAuth2 scopes for catalog access. */
export const SCOPES = ['catalogs:read', 'pins:read', 'boards:read']
