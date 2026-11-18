/**
 * OroCommerce REST API constants.
 *
 * OroCommerce exposes a JSON:API-compliant REST surface under `/api/`.
 * All requests require `application/vnd.api+json` content type.
 */

export const CONTENT_TYPE = 'application/vnd.api+json'

export const DEFAULT_PAGE_SIZE = 25
export const MAX_PAGE_SIZE = 100

/** OAuth2 client-credentials tokens expire after 3600s; refresh 5 min early. */
export const TOKEN_LIFETIME_SECONDS = 3300

export const TOKEN_ENDPOINT = '/oauth2-token'
