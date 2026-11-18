/**
 * Scalapay REST API constants.
 *
 * Scalapay is a Buy-Now-Pay-Later gateway. The merchant API key is a Bearer
 * token (production keys are prefixed `sp_`). Two hosts exist:
 *   - integration (sandbox/test): https://integration.api.scalapay.com
 *   - production:                 https://api.scalapay.com
 *
 * The adapter targets the production host by default; the sandbox host is
 * exported so callers/tests can point at integration.
 *
 * Docs: https://developers.scalapay.com/reference/api-architecture
 */
export const API_BASE_URL = 'https://api.scalapay.com'
export const SANDBOX_API_BASE_URL = 'https://integration.api.scalapay.com'

/**
 * Reporting list endpoints (`/v1/reporting/...`) page from 0 and cap `size`
 * at 5000; we default to a smaller window.
 */
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 5000
