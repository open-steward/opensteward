/**
 * Fiserv Commerce Hub REST API constants.
 *
 * Commerce Hub is Fiserv's modern unified payments REST surface. The cert
 * (sandbox) and production environments share the same paths; only the host
 * differs:
 *   - cert (sandbox): https://cert.api.fiservapps.com/ch
 *   - production:     https://prod.api.fiservapps.com/ch
 *
 * Docs: https://developer.fiserv.com/product/CommerceHub
 */
export const CERT_BASE_URL = 'https://cert.api.fiservapps.com/ch'
export const PRODUCTION_BASE_URL = 'https://prod.api.fiservapps.com/ch'

/**
 * Create a charge — a sale when `captureFlag` is true, auth-only when false.
 * Also the capture path: Commerce Hub has no separate `/captures` endpoint —
 * a capture is a POST here with `referenceTransactionDetails.referenceTransactionId`
 * set and `transactionDetails.captureFlag: true`.
 */
export const CHARGES_PATH = '/payments/v1/charges'
/** Cancel / void an authorised-but-uncaptured charge. */
export const CANCELS_PATH = '/payments/v1/cancels'
/** Refund a settled charge (full or partial). */
export const REFUNDS_PATH = '/payments/v1/refunds'
/** Look up a transaction's current state by reference id. */
export const TRANSACTION_INQUIRY_PATH = '/payments/v1/transaction-inquiry'

/**
 * `Auth-Token-Type` header value. Commerce Hub signs each request with an
 * HMAC-SHA256 message signature derived from the API key + secret.
 */
export const AUTH_TOKEN_TYPE = 'HMAC'
