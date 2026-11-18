/**
 * Patreon API constants.
 *
 * Patreon v2 uses JSON:API format (`application/json` content type,
 * but JSON:API envelopes). Base URL is `https://www.patreon.com/api/oauth2/v2/`.
 * OAuth2 authorization code flow for user auth.
 */

export const BASE_URL = 'https://www.patreon.com/api/oauth2/v2'

export const AUTH_URL = 'https://www.patreon.com/oauth2/authorize'

export const TOKEN_URL = 'https://www.patreon.com/api/oauth2/token'

export const CONTENT_TYPE = 'application/json'

export const DEFAULT_PAGE_SIZE = 25

export const MAX_PAGE_SIZE = 100

/** Patreon access tokens expire after ~31 days; refresh 1 day early. */
export const TOKEN_LIFETIME_SECONDS = 30 * 24 * 3600
