/**
 * AvidXchange API constants.
 *
 * AvidXchange is an AP-automation platform. Partner API access is granted
 * per-customer; credentials consist of a static API key (sent in the
 * `x-api-key` header) plus a `companyId` that scopes every request to a
 * single payer company.
 *
 * Sandbox: https://sandbox-api.avidxchange.com/v1
 * Production: https://api.avidxchange.com/v1
 */

export const AVIDXCHANGE_API_BASE_PROD = 'https://api.avidxchange.com/v1'
export const AVIDXCHANGE_API_BASE_SANDBOX = 'https://sandbox-api.avidxchange.com/v1'

/** Header name for the static partner API key. */
export const AVIDXCHANGE_API_KEY_HEADER = 'x-api-key'

/**
 * AvidXchange rate-limits partner callers to 120 requests/minute by default.
 * Individual tenants may be provisioned differently.
 */
export const RATE_LIMIT_RPM = 120

/** AvidXchange pages are limited to 100 records. */
export const MAX_PAGE_SIZE = 100

/** Default page size for list calls. */
export const DEFAULT_PAGE_SIZE = 50
