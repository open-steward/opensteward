/**
 * Etsy API v3 constants.
 *
 * Etsy's Open API v3 is a seller-scoped REST API. Every endpoint that
 * operates on seller data requires a `shopId` path parameter, which the
 * adapter reads from `credentials.extra.shopId`.
 *
 * Auth: OAuth2 authorization-code with PKCE. Access tokens expire after
 * 1 hour; refresh tokens are long-lived.
 *
 * Slug: `etsy` (both directory and platform identifier).
 */

/** Etsy API v3 base URL. */
export const BASE_URL = 'https://openapi.etsy.com/v3/application'

/** Etsy OAuth2 token endpoint. */
export const TOKEN_ENDPOINT = 'https://api.etsy.com/v3/public/oauth/token'

/** Access tokens expire in 1 hour; refresh 5 minutes early. */
export const TOKEN_BUFFER_MS = 5 * 60 * 1000

/** Default list page size. */
export const DEFAULT_PAGE_SIZE = 25

/** Maximum items per page supported by Etsy. */
export const MAX_PAGE_SIZE = 100
