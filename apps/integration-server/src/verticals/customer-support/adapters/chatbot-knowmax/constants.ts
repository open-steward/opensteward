/**
 * Knowmax REST API constants.
 *
 * Knowmax is a per-tenant knowledge-management platform.  Each customer is
 * assigned a domain slug; the API base URL is
 *   https://app.knowmax.ai/{clientName}
 *
 * Auth: Bearer token generated inside the platform at
 *   Admin > Company Settings > Generate Token
 *
 * The Postman collection is published at:
 *   https://documenter.getpostman.com/view/10036214/SWLk3kVm
 */

/**
 * Template for the per-tenant base URL.  Replace {clientName} with the
 * value stored in credentials.extra.clientName at request time.
 */
export const API_BASE_URL_TEMPLATE = 'https://app.knowmax.ai/{clientName}'

/** Maximum page size Knowmax accepts on list endpoints. */
export const DEFAULT_PAGE_SIZE = 50
