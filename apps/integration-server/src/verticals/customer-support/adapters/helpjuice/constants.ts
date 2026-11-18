/**
 * Helpjuice API v3 constants.
 *
 * Base URL is per-account: https://<account>.helpjuice.com/api/v3
 * The account subdomain is stored in credentials.extra.account at runtime.
 */

/** Fallback base URL — callers should prefer buildBaseUrl(account) */
export const API_BASE_URL_TEMPLATE = 'https://{account}.helpjuice.com/api/v3'

/** Default page size (Helpjuice default is 25, max 1000) */
export const DEFAULT_PAGE_SIZE = 25

/** Maximum page size allowed by the API */
export const MAX_PAGE_SIZE = 1000

/** Build the per-tenant base URL from the account subdomain */
export function buildBaseUrl(account: string): string {
  return `https://${account}.helpjuice.com/api/v3`
}
