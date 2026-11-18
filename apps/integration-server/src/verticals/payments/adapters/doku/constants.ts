/**
 * DOKU (Jokul) REST API constants.
 *
 * DOKU is an Indonesian payment gateway. It runs two hosted environments —
 * sandbox and production — selected by the `environment` credential field.
 * There is no per-account host; the same paths are served from both hosts.
 *
 * Endpoints used by this adapter. Each path is used twice: as the HTTP path
 * and as the `Request-Target` line in the HMAC signature string-to-sign.
 *   POST /checkout/v1/payment              — generate a Jokul Checkout payment
 *                                            (returns the hosted payment URL)
 *   GET  /orders/v1/status/{invoice}       — read an order/transaction by the
 *                                            merchant invoice number
 *   POST /cancellation/credit-card/refund  — refund a settled transaction
 *
 * Docs: https://jokul.doku.com/docs and https://developers.doku.com/
 */
export const SANDBOX_BASE_URL = 'https://api-sandbox.doku.com'
export const PRODUCTION_BASE_URL = 'https://api.doku.com'

/** Resolve the base URL from the stored `environment` credential value. */
export function baseUrlFor(environment: string | undefined): string {
  return environment === 'production' ? PRODUCTION_BASE_URL : SANDBOX_BASE_URL
}

/** POST — generate a Jokul Checkout payment and get a hosted payment URL. */
export const CHECKOUT_PAYMENT_PATH = '/checkout/v1/payment'
/** GET — look up an order/transaction by merchant invoice number. */
export const ORDER_STATUS_PATH = '/orders/v1/status'
/** POST — refund a settled transaction. */
export const REFUND_PATH = '/cancellation/credit-card/refund'

/**
 * DOKU settles in Indonesian Rupiah, which has no minor-unit subdivision in
 * practice — amounts are whole rupiah. The canonical schema stores integer
 * "minor units"; for IDR the multiplier is 1 (1 rupiah == 1 minor unit), so no
 * scaling is needed in either direction.
 */
export const MINOR_UNITS_MULTIPLIER = 1

/** DOKU settles in Indonesian Rupiah only. */
export const DEFAULT_CURRENCY = 'IDR'
