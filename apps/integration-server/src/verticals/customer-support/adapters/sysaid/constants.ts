/**
 * SysAid Connect API v1 constants.
 *
 * Per-tenant account subdomain — baseURL is templated at request time via
 * credentials.extra.accountId (the subdomain portion of {account}.sysaidit.com).
 *
 * Docs: https://developers.sysaid.com
 */

/** Template for the SysAid Connect API base URL. Replace {account} with the tenant account ID. */
export const API_BASE_URL_TEMPLATE = 'https://{account}.sysaidit.com/connect/v1'

/** Token endpoint used to exchange client credentials for a Bearer token. */
export const TOKEN_URL_TEMPLATE = 'https://{account}.sysaidit.com/connect/v1/access-tokens'

/**
 * Max results per page for GET /service-records/search: its `limit` has
 * schema maximum 100 (https://developers.sysaid.com/reference/searchservicerecords).
 */
export const SR_PAGE_SIZE = 100

/**
 * Max results per page for /agents, /end-users, /groups and
 * /activities/sr/search: `limit` "up to 500"
 * (https://developers.sysaid.com/reference/getagents).
 */
export const DEFAULT_PAGE_SIZE = 500
