/**
 * Znode Commerce REST API constants.
 *
 * Znode exposes a standard REST API under `https://{host}/api/`.
 * All requests use JSON content type with Bearer token auth.
 */

export const CONTENT_TYPE = 'application/json'

export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 100

/** OAuth2 tokens expire after 3600s by default; refresh 5 min early. */
export const TOKEN_LIFETIME_SECONDS = 3300

export const TOKEN_ENDPOINT = '/api/oauth/token'
