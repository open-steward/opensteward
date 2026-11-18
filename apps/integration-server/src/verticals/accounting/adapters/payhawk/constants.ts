// Payhawk REST API — https://developers.payhawk.com/
// Base URL: https://api.payhawk.io/api/v3
// Auth: API key via X-Payhawk-ApiKey header (or Bearer token)
// Rate limit: 15 req/s
// Pagination: $skip / $take (offset-based), max 10000 per page

export const PAYHAWK_API_BASE = 'https://api.payhawk.io/api/v3'

// Rate limit: 15 req/s
export const RATE_LIMIT_RPS = 15

// Pagination
/**
 * The documented `$take` maximum. First-party spec
 * (https://api.payhawk.com/api/v3/docs.json): `$take` on the expenses and
 * suppliers operations is "Max number of objects to return (maximum number
 * of items that will be returned is 10000)", and IBankStatementQueryParams,
 * IExpenseQueryParams, ISuppliersQueryParams and IPagingQueryParams all give
 * it `"maximum": 10000`.
 */
export const MAX_PAGE_SIZE = 10000
export const DEFAULT_PAGE_SIZE = 100
