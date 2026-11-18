/**
 * NocoDB REST API constants.
 *
 * NocoDB is an open-source no-code database platform (Airtable alternative)
 * that exposes REST APIs at:
 *   - https://app.nocodb.com/api/v2  (NocoDB Cloud)
 *   - https://<self-hosted-domain>/api/v2  (self-hosted)
 *
 * Authentication uses a long-lived personal API token sent in the `xc-token`
 * header. Tokens are 40-character Nano IDs with the prefix `nc_pat_`.
 *
 * Pagination: offset/limit style — `?limit=N&offset=M`.
 *   Default limit: 25  Max limit: 1000
 *
 * Rate limit: 5 requests/second per user (429 on breach).
 *
 * Docs: https://nocodb.com/docs/product-docs/developer-resources/rest-apis
 */

/** NocoDB Cloud API base URL. Self-hosted: replace with `https://<your-domain>/api/v2`. */
export const API_BASE_URL = 'https://app.nocodb.com/api/v2'

/** Where a user creates an API token. */
export const TOKEN_HELP_URL = 'https://nocodb.com/docs/product-docs/account-settings/api-tokens'

/**
 * Default page size for list endpoints.
 * NocoDB defaults to 25; we use 100 for efficiency (well within the 1000 max).
 */
export const DEFAULT_PAGE_SIZE = 100

/**
 * Largest `limit` the records endpoint serves. NocoDB's environment-variable
 * docs (https://nocodb.com/docs/self-hosting/environment-variables):
 * `NC_DB_QUERY_LIMIT_MAX` "Maximum allowable pagination limit." "Defaults to
 * `1000`."; a larger limit is served at this size.
 */
export const MAX_RECORDS_LIMIT = 1000

/**
 * Most requests listTasks makes to fill one caller page when the server
 * serves short pages, as it does when an operator lowers
 * `NC_DB_QUERY_LIMIT_MAX` below the requested size. This bounds the cost of
 * one caller page on a misconfigured server.
 */
export const MAX_TOP_UP_REQUESTS = 10
