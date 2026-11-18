/**
 * Commerce Layer REST API constants.
 *
 * Commerce Layer exposes a JSON:API-compliant REST surface under `/api/`.
 * All requests require `application/vnd.api+json` content type.
 * Base URL pattern: `https://{slug}.commercelayer.io/api/`
 */

export const CONTENT_TYPE = 'application/vnd.api+json'

export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 25 // Commerce Layer caps at 25

/** OAuth2 client-credentials tokens expire after ~7200s; refresh 5 min early. */
export const TOKEN_LIFETIME_SECONDS = 6900

export const TOKEN_PATH = '/oauth/token'
