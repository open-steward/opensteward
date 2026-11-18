/** lemlist REST API constants */

/** Production base URL — all REST endpoints live under this prefix. */
export const BASE_URL = 'https://api.lemlist.com/api'

/** Default page size for list endpoints (every list endpoint defaults to 100). */
export const DEFAULT_PAGE_SIZE = 100

/**
 * GET /contacts limit: "Maximum number of contacts to return (1–500)."
 * GET /companies limit: "Number of companies to retrieve. Default: 100. Maximum: 500"
 */
export const CONTACTS_MAX_PAGE_SIZE = 500
export const COMPANIES_MAX_PAGE_SIZE = 500

/**
 * GET /campaigns, GET /activities and GET /companies/{id}/notes all document
 * "Default: 100. Maximum: 100". The lowest ceiling of any list endpoint, so
 * it is also the adapter's declared maxPageSize.
 */
export const LIST_MAX_PAGE_SIZE = 100
