/**
 * Kaiten REST API constants.
 *
 * Base URL pattern: https://<company>.kaiten.ru/api/latest
 * The `/latest` segment tracks the newest stable version; v1 is also accepted.
 *
 * Authentication: every request carries
 *   Authorization: Bearer <api_token>
 * The token is generated from the user's Kaiten profile settings.
 *
 * Rate limit: 5 requests per second.  429 = back-off + retry.
 *
 * Pagination: all list endpoints accept `limit` (max 100, default 100) and
 * `offset` (records to skip).  There is no cursor token.
 */

/** Path suffix appended to the tenant host for all REST calls. */
export const API_PATH = '/api/latest'

/** Default page size of Kaiten list endpoints. */
export const DEFAULT_PAGE_SIZE = 100

/** Maximum `limit` of the offset-paged list endpoints ("Max: 100"). */
export const MAX_PAGE_SIZE = 100

/** URL shown to users when they need to generate an API token. */
export const API_KEY_HELP_URL = 'https://developers.kaiten.ru/'
