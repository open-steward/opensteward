/**
 * Restaurant365 (R365) API constants.
 *
 * REST API: tenant-specific subdomain, JWT bearer token.
 * Base URL pattern: https://{tenant}.restaurant365.com/APIv1
 * OData read API: https://odata.restaurant365.net/api/v2/views (Basic auth)
 *
 * Auth: api_key (bearer token issued by R365 support, stored as accessToken).
 * Tenant subdomain stored in credentials.extra.subdomain.
 */

/** OData read-API base — used for all GET operations (Items, Locations, Companies). */
export const ODATA_BASE_URL = 'https://odata.restaurant365.net/api/v2/views'

/** REST write-API base URL template. Filled at runtime with credentials.extra.subdomain. */
export const REST_BASE_URL_TEMPLATE = 'https://{tenant}.restaurant365.com/APIv1'

/** OData $top page size. */
export const DEFAULT_PAGE_SIZE = 100
