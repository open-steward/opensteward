/**
 * Manager accounting software API constants.
 *
 * Cloud edition base URL format: https://{business-slug}.manager.io/api2
 * The business slug is stored in credentials.tenantId.
 *
 * Auth: X-API-KEY header (token generated in Settings > Access Tokens)
 * Docs: https://manager.readme.io/reference
 */

/** Suffix appended to the cloud hostname to reach the API2 endpoint. */
export const MANAGER_API_PATH = '/api2'

/**
 * Build the full API2 base URL for a given business slug.
 * Falls back to the local/server edition URL when no slug is provided.
 */
export function buildApiBase(businessSlug?: string): string {
  if (businessSlug) {
    return `https://${businessSlug}.manager.io/api2`
  }
  // Server-edition fallback (localhost default port)
  return 'http://localhost:55667/api2'
}

export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 1000
