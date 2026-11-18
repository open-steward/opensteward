/**
 * BigTime IQ REST API (v2).
 *
 * BigTime is single-host SaaS: every firm lives behind the same base URL and
 * the firm is selected per-request via the `X-Auth-Realm` (firm id) header
 * rather than a per-tenant host.
 *
 * Docs: https://iq.bigtime.net/BigtimeData/api/v2/Help/Overview
 */
export const API_BASE_URL = 'https://iq.bigtime.net/BigtimeData/api/v2'

/** Header carrying the firm API token on every request. */
export const AUTH_TOKEN_HEADER = 'X-Auth-Token'

/** Header carrying the firm id (realm) on every request. */
export const AUTH_REALM_HEADER = 'X-Auth-Realm'

/** Where a firm admin generates a permanent API token + finds the firm id. */
export const TOKEN_HELP_URL =
  'https://help.bigtime.net/hc/en-us/articles/10565842022423-Getting-Started-With-BigTime-s-API'

/**
 * BigTime list endpoints return full bare arrays (no cursor/offset paging),
 * so this is kept only for interface symmetry — the client does not page.
 */
export const DEFAULT_PAGE_SIZE = 100
