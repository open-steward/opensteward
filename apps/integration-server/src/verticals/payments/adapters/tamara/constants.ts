/**
 * Tamara REST API constants.
 *
 * Tamara is a Buy-Now-Pay-Later (BNPL) gateway operating across the GCC
 * (Saudi Arabia, UAE, Kuwait, Bahrain, Oman). The merchant API authenticates
 * with a long-lived API Token as a Bearer token (`Authorization: Bearer
 * <api-token>`). There is no OAuth and no token refresh.
 *
 * Two hosts exist:
 *   - sandbox (integration/testing): https://api-sandbox.tamara.co
 *   - production:                    https://api.tamara.co
 *
 * The adapter targets the production host by default; the sandbox host is
 * exported so callers/tests can point at it.
 *
 * Docs: https://docs.tamara.co/reference/tamara-api-reference-documentation
 */
export const API_BASE_URL = 'https://api.tamara.co'
export const SANDBOX_API_BASE_URL = 'https://api-sandbox.tamara.co'

/**
 * Tamara's merchant API exposes single-resource order/payment endpoints
 * looked up by `order_id`; there is no paginated list endpoint, so no page
 * size constant is needed.
 */
