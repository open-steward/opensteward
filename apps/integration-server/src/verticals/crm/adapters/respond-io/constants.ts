/**
 * "The base URL for all API requests is `api.respond.io/v2`, and all requests
 * must be made over HTTPS." (https://developers.respond.io/)
 */
export const BASE_URL = 'https://api.respond.io/v2'
/** Page size asked for when the caller gives none. */
export const DEFAULT_PAGE_SIZE = 25
/**
 * POST /contact/list `limit`: `{minimum: 1, exclusiveMaximum: 100, default: 10}`
 * — rendered "< 100" on
 * https://developers.respond.io/docs/api/0759d02787ab3-list-the-contacts.
 */
export const MAX_PAGE_SIZE = 99
