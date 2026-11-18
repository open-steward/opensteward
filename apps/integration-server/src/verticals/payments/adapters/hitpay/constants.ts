/**
 * HitPay REST API endpoints.
 *
 * HitPay is a Singapore-headquartered gateway covering South-East Asia
 * (SGD, MYR, USD, PHP, …). The public API is versioned at `/v1`. Auth is a
 * single business API key sent in the `X-BUSINESS-API-KEY` header.
 *
 * Docs: https://docs.hitpayapp.com/apis/guide/online-payments
 */

/** Production API root. */
export const API_BASE_URL = 'https://api.hit-pay.com/v1'

/** Sandbox API root (test business keys). */
export const SANDBOX_API_BASE_URL = 'https://api.sandbox.hit-pay.com/v1'

/** Header carrying the business API key. */
export const API_KEY_HEADER = 'X-BUSINESS-API-KEY'

/** Header carrying the HMAC-SHA256 signature on event webhooks. */
export const WEBHOOK_SIGNATURE_HEADER = 'hitpay-signature'

/** Page size sent when the caller gives no `limit`. */
export const DEFAULT_PAGE_SIZE = 50

/**
 * `GET /v1/payment-requests` takes `per_page` ("Page size", maximum: 100) and
 * `current_page` ("Page number (not `page`)").
 * https://docs.hitpayapp.com/apis/payment-request/get-payment-requests.md
 *
 * Only this endpoint documents a maximum, and listSubscriptions does not page
 * yet, so the adapter declares no `capabilities.maxPageSize`: listCharges
 * clamps to this itself and reports the size it paged at.
 */
export const PAYMENT_REQUESTS_MAX_PAGE_SIZE = 100
