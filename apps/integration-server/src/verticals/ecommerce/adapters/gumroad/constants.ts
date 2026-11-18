/**
 * Gumroad API constants.
 *
 * Gumroad is a digital-product marketplace for creators. The REST API
 * lives at api.gumroad.com/v2 and is authenticated via OAuth2.
 *
 * Auth: OAuth2 authorization-code flow. Access tokens do NOT expire
 * (Gumroad issues long-lived tokens). Refresh is a no-op unless the
 * token is explicitly revoked.
 *
 * Slug: `gumroad` (both directory and platform identifier).
 */

/** Gumroad REST API v2 base URL. */
export const BASE_URL = 'https://api.gumroad.com/v2'

/** Gumroad OAuth2 authorization endpoint. */
export const AUTH_URL = 'https://gumroad.com/oauth/authorize'

/** Gumroad OAuth2 token endpoint. */
export const TOKEN_ENDPOINT = 'https://api.gumroad.com/oauth/token'

/** Default list page size (Gumroad has no built-in pagination on most endpoints). */
export const DEFAULT_PAGE_SIZE = 25
