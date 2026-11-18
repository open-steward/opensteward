/**
 * ConnectWise PSA REST API constants.
 *
 * Cloud tenants: api-{region}.myconnectwise.net
 * On-premise:    {customer-domain}
 *
 * The entry point path is versioned; v4_6_release is the stable cloud alias.
 * Region codes: na (North America), eu (Europe), au (Australia/Asia-Pacific).
 */

/** Cloud North America base URL — overridden per-tenant via credentials.extra.siteUrl */
export const DEFAULT_CLOUD_BASE_URL = 'https://api-na.myconnectwise.net'

/**
 * API path prefix appended to siteUrl before the resource path.
 * Example: https://api-na.myconnectwise.net/v4_6_release/apis/3.0/service/tickets
 */
export const API_ENTRY_POINT = '/v4_6_release/apis/3.0'

/** Default page size. The public swagger documents no maximum pageSize. */
export const DEFAULT_PAGE_SIZE = 100
