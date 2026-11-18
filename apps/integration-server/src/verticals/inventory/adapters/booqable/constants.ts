/**
 * Booqable REST API v4 constants.
 *
 * Auth: Bearer token (access_token) + company slug stored in credentials.extra.
 * Base URL is per-tenant: https://{company_slug}.booqable.com/api/4
 */

/** Build the per-tenant base URL from the company slug. */
export function buildBaseUrl(companySlug: string): string {
  return `https://${companySlug}.booqable.com/api/4`
}

export const DEFAULT_PAGE_SIZE = 100
