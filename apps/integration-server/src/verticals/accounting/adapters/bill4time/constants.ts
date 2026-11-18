/**
 * Bill4Time REST API constants.
 *
 * Authentication: API key embedded in the URL path.
 * Base URL:  https://secure.bill4time.com/b4t-api/{ApiKey}/v2/
 *
 * Pagination: OData-style $top / $skip query parameters.
 * Docs: https://support.bill4time.com/hc/en-us/sections/27905374735643-B4T-API
 */

export const BILL4TIME_API_HOST = 'https://secure.bill4time.com'
export const BILL4TIME_API_VERSION = 'v2'

/** Build the per-credential base URL from the stored API key. */
export function buildBaseUrl(apiKey: string): string {
  return `${BILL4TIME_API_HOST}/b4t-api/${encodeURIComponent(apiKey)}/${BILL4TIME_API_VERSION}`
}

// Pagination — OData $top / $skip
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 1000
