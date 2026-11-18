/**
 * Jitbit Helpdesk API constants.
 *
 * Jitbit is a self-hosted OR SaaS helpdesk. For SaaS the base URL follows the
 * pattern https://{company}.jitbit.com/helpdesk/api. For self-hosted the
 * customer supplies the full base URL. We store it in credentials.extra.baseUrl
 * set during exchangeCredentials().
 *
 * Auth: Bearer token obtained from /User/Token. Alternatively Basic auth
 * (username:password base64) but we normalise to Bearer token.
 */

/** Fallback SaaS base URL template — replaced at runtime with customer subdomain. */
export const API_BASE_URL_TEMPLATE = 'https://{subdomain}.jitbit.com/helpdesk/api'

/** Jitbit paginates with offset + count. Max page size is 300. */
export const DEFAULT_PAGE_SIZE = 50

/**
 * GET /api/Tickets: `count` "How many tickets to return. Default: 10. Max: 300."
 * (https://www.jitbit.com/docs/api/). Also the adapter's declared maxPageSize.
 */
export const MAX_PAGE_SIZE = 300

/**
 * GET /api/Users: `count` "number of users to return. Default: 500", paged by
 * `page` (not `offset`). No maximum is documented, so the default is sent.
 */
export const USERS_PAGE_SIZE = 500

/** Ticket list filter modes accepted by GET /Tickets?mode= */
export const TICKET_MODE_ALL = 'all'
