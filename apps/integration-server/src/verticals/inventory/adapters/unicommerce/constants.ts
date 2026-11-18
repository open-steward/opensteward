/**
 * Unicommerce (Uniware) REST API constants.
 *
 * Auth: OAuth2 password-grant → Bearer token.
 *       Credentials store: accessToken = bearer token, extra.tenant = subdomain,
 *       extra.refreshToken = refresh token, extra.facility = facility code.
 *
 * Base URL:  https://{tenant}.unicommerce.com
 * Auth:      GET /oauth/token?grant_type=password&client_id=my-trusted-client&username=…&password=…
 * API path:  /services/rest/v1/{resource}
 *
 * Facility-level APIs require the Facility header (extra.facility).
 */

/** Fixed public OAuth2 client_id used by Unicommerce. */
export const OAUTH_CLIENT_ID = 'my-trusted-client'

/** Common REST v1 path prefix. */
export const API_BASE_PATH = '/services/rest/v1'

/** Build a full tenant base URL. */
export function tenantBaseUrl(tenant: string): string {
  return `https://${tenant}.unicommerce.com`
}

/** Default displayLength for search endpoints that support pagination. */
export const DEFAULT_PAGE_SIZE = 50
