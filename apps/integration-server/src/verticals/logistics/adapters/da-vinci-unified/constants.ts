/**
 * Da Vinci Unified REST API.
 *
 * The WMS is multi-tenant and hosted on customer-specific servers
 * (e.g. https://dv1.wdgcorp.com:8443/v1/).  The default below is the
 * publicly-documented API host; customers supply their own instance URL
 * via credentials.extra.serverUrl.
 *
 * Full request paths follow the pattern:
 *   {serverUrl}/{licenseId}/{dbName}/{sessionId}/{resource}
 */
export const DA_VINCI_API_DEFAULT_SERVER = 'https://api.wdgcorp.com/v1/'
export const DA_VINCI_DASHBOARD_URL = 'https://api.wdgcorp.com/'

/** Millis before token expiry at which we proactively refresh */
export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000

/** Max outbound requests per second to stay within Da Vinci rate limits */
export const RATE_LIMIT_RPS = 5
