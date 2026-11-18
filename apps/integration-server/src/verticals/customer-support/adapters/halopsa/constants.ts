/**
 * HaloPSA REST API constants.
 *
 * Every HaloPSA instance is tenant-specific. The base URL is resolved from
 * credentials.extra.tenantUrl (e.g. https://acme.halopsa.com).  The auth
 * (token) server lives under <tenantUrl>/auth and the REST API under
 * <tenantUrl>/api.
 */

/** Suffix appended to the customer's tenant base URL to form the token endpoint. */
export const AUTH_PATH = '/auth/token'

/** Suffix appended to the customer's tenant base URL to form the API root. */
export const API_PATH = '/api'

/** Default page size for list endpoints. Max 1000 per HaloPSA docs. */
export const DEFAULT_PAGE_SIZE = 50

/**
 * OAuth 2.0 scopes required for read access.
 * HaloPSA supports granular scopes; "all" is the broadest grant and is
 * accepted by default.  Narrow scopes can be overridden at auth time.
 */
export const DEFAULT_SCOPES = ['read:tickets', 'read:agents', 'read:customers', 'read:teams']
