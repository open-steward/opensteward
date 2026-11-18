/**
 * Picqer REST API constants.
 *
 * Auth: API key via HTTP Basic Auth (key as username, password ignored).
 * Base URL is per-customer subdomain: https://{subdomain}.picqer.com/api/v1
 * Pagination: offset-based, 100 results per page.
 */
export const DEFAULT_PAGE_SIZE = 100
export const API_VERSION = 'v1'

/** Build per-tenant base URL from subdomain credential. */
export function buildBaseUrl(subdomain: string): string {
  return `https://${subdomain}.picqer.com/api/${API_VERSION}`
}
