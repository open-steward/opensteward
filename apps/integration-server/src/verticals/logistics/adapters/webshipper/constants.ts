/**
 * Webshipper API 2.0
 * Base URL: https://<account>.api.webshipper.io/v2/
 * OAuth2: Resource Owner Password Credentials or Authorization Code grant
 * Rate limit: 2 calls/second, 40-call burst capacity per token
 */

/** Build the tenant-scoped base URL from the account slug stored in credentials.extra */
export function buildBaseUrl(accountSlug: string): string {
  return `https://${accountSlug}.api.webshipper.io/v2/`
}

/** Token endpoint path (relative to base URL) */
export const TOKEN_PATH = 'oauth/token'

/** Dashboard URL for auth setup */
export const WEBSHIPPER_DASHBOARD_URL = 'https://app.webshipper.com/settings/oauth_applications'

/** Webshipper paginates at 30 records per page */
export const PAGE_SIZE = 30

/** Refresh buffer: refresh 60 seconds before expiry */
export const TOKEN_REFRESH_BUFFER_MS = 60_000

/** JSON:API content type */
export const JSONAPI_CONTENT_TYPE = 'application/vnd.api+json'
