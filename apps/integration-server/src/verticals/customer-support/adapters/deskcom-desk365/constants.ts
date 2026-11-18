/**
 * Desk365 REST API constants.
 *
 * Per-tenant subdomain: https://<subdomain>.desk365.io/apis/v3/
 * Auth: API key in the Authorization header.
 * Docs: https://help.desk365.io/en/articles/desk365-api/
 */

/** URL template — {subdomain} is replaced at request time via credentials.extra.tenantSubdomain */
export const API_BASE_URL_TEMPLATE = 'https://{subdomain}.desk365.io/apis/v3'

/**
 * Desk365 supports ticket_count of 30 | 50 | 100.
 * We default to 100 for efficiency.
 */
export const DEFAULT_PAGE_SIZE = 100

/**
 * Upstream page size for GET /v3/tickets: the largest documented
 * `ticket_count` ("Select number of tickets to retrieve per call.", enum 30, 50, 100).
 */
export const TICKETS_PAGE_SIZE = 100

/**
 * GET /v3/contacts has no page-size parameter: `offset` "Get next 30
 * contacts from offset value."
 */
export const CONTACTS_PAGE_SIZE = 30
