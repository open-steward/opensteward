/**
 * Scoro API v2 constants.
 *
 * Scoro is account-hosted: every customer has their own subdomain.
 * The base URL is therefore a template; the actual URL is built at
 * runtime from the company_account_id stored in credentials.extra.
 *
 * Auth: all requests are HTTP POST with apiKey + company_account_id
 * in the JSON body — there are no auth headers.
 *
 * Docs: https://api.scoro.com/api/v2
 */

/** Page size when the caller names none. */
export const DEFAULT_PAGE_SIZE = 50

/**
 * Scoro's list ceiling, from "Request Limits" at https://api.scoro.com/api/v2:
 * "A maximum of 100 results will be returned for list methods, regardless of
 * the value sent with the per_page parameter." (25 with detailed_response,
 * which this adapter never sends.)
 */
export const MAX_PAGE_SIZE = 100

/**
 * Build the per-account REST base URL.
 * @param companyAccountId  e.g. "acme" → https://acme.scoro.com/api/v2
 */
export function buildBaseUrl(companyAccountId: string): string {
  return `https://${companyAccountId}.scoro.com/api/v2`
}
