/**
 * Deskpro REST API v2 constants.
 *
 * Deskpro is a self-hosted / cloud help desk. Every instance lives at a
 * customer-controlled domain (e.g. https://acme.deskpro.com).  The base URL
 * is therefore constructed at request time from credentials.extra.instanceUrl.
 *
 * Auth: Authorization: key <id>:<secret>
 * Docs: https://deskpro.gitbook.io/dev-guide/api-basics/api-introduction
 */

/** API path segment appended to the customer's instance URL. */
export const API_PATH = '/api/v2'

/**
 * Default page size for collection requests.
 * Deskpro uses the `count` query parameter for page size and `page` for
 * the page number.
 */
export const DEFAULT_PAGE_SIZE = 100
