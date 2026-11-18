export const API_BASE_URL = 'https://api.respond.io/v2'

/**
 * POST /contact/list `limit` — "Number of contacts to return i.e. page size."
 * Schema: `minimum: 1`, `exclusiveMaximum: 100`, `default: 10`
 * (https://developers.respond.io/docs/api/0759d02787ab3-list-the-contacts).
 * `exclusiveMaximum: 100` makes 99 the largest documented page.
 */
export const DEFAULT_PAGE_SIZE = 10
export const MAX_PAGE_SIZE = 99
