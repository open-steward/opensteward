/**
 * Descartes Sellercloud REST API constants.
 *
 * Auth: username + password exchanged for a JWT Bearer token.
 * Base URL: team-specific subdomain — stored in credentials.extra.baseUrl
 * Token TTL: 60 minutes; client auto-refreshes before each request when expired.
 *
 * Docs: https://developer.sellercloud.com/
 */

/**
 * Resolve the REST API endpoint for a given Sellercloud team name.
 * Real base-URL is obtained at runtime from credentials.extra.baseUrl.
 * This helper is provided so tests or bootstrap code can build the URL.
 */
export function buildBaseUrl(teamSubdomain: string): string {
  return `https://${teamSubdomain}.api.sellercloud.com/rest`
}

/** Default page size for paginated endpoints (max allowed by Sellercloud). */
export const DEFAULT_PAGE_SIZE = 50

/** Token TTL in milliseconds (55 min — 5 min buffer before the 60-min expiry). */
export const TOKEN_TTL_MS = 55 * 60 * 1000
