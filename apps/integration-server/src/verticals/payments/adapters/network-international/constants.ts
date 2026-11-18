/**
 * Network International (N-Genius Online) REST API constants.
 *
 * N-Genius is an order-centric gateway hosted in the UAE. Both environments
 * share the same path layout — only the host differs:
 *   - sandbox / UAT: https://api-gateway.sandbox.ngenius-payments.com
 *   - production:    https://api-gateway.ngenius-payments.com
 *
 * Auth is two-legged: the merchant's Service Account API key is a Basic-auth
 * secret POSTed to the identity service for a short-lived (5-minute) bearer
 * access token, which is then sent on every payment-API call.
 *
 * Docs: https://docs.ngenius-payments.com
 */
export const SANDBOX_BASE_URL = 'https://api-gateway.sandbox.ngenius-payments.com'
export const PROD_BASE_URL = 'https://api-gateway.ngenius-payments.com'

/** Identity service — exchanges the Basic API key for a bearer access token. */
export const ACCESS_TOKEN_PATH = '/identity/auth/access-token'

/** Content type / Accept for the identity (token) endpoint. */
export const IDENTITY_CONTENT_TYPE = 'application/vnd.ni-identity.v1+json'

/** Content type / Accept for the payment (transactions) endpoints. */
export const PAYMENT_CONTENT_TYPE = 'application/vnd.ni-payment.v2+json'

/**
 * Access tokens live for 300 seconds. We re-mint once we are within this
 * margin of expiry so a single client can serve a whole batch of calls.
 */
export const TOKEN_TTL_MS = 300_000
export const TOKEN_EXPIRY_MARGIN_MS = 30_000
