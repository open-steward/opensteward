/**
 * noCRM.io API constants.
 * Docs: https://www.nocrm.io/api
 *
 * The base URL is subdomain-specific. Credentials carry the subdomain so
 * the client builds the correct root at request time.
 *
 * Auth: X-API-KEY header (account-level admin access).
 */

/** Number of items fetched per page when callers don't supply a limit. */
export const DEFAULT_PAGE_SIZE = 25

/** Maximum allowed by noCRM pagination. */
export const MAX_PAGE_SIZE = 100

/**
 * Build the REST base URL for a given subdomain.
 * e.g. subdomain="acme" → "https://acme.nocrm.io/api/v2"
 */
export function buildBaseUrl(subdomain: string): string {
  return `https://${subdomain}.nocrm.io/api/v2`
}
