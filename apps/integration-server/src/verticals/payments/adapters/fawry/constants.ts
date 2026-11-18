/**
 * FawryPay server (ECommerceWeb) REST API constants.
 *
 * Fawry is Egypt's leading e-payments network. The staging and production
 * environments share identical paths; only the host differs:
 *   - staging:    https://atfawry.fawrystaging.com
 *   - production: https://www.atfawry.com
 *
 * There is no OAuth and no Bearer token. Every request carries the
 * `merchantCode` plus a per-request SHA-256 `signature` built from selected
 * request fields concatenated with the merchant's `secureKey` (see auth.ts /
 * client.ts). The secureKey never leaves the server.
 *
 * Docs: https://developer.fawrystaging.com/docs/server-apis/create-payment-refno-apis
 */
export const STAGING_BASE_URL = 'https://atfawry.fawrystaging.com'
export const PRODUCTION_BASE_URL = 'https://www.atfawry.com'

/** Common prefix for the server (ECommerceWeb) payment endpoints. */
const PAYMENTS_PREFIX = '/ECommerceWeb/Fawry/payments'

/** Create a charge (PayAtFawry reference number, card, or mobile wallet). */
export const CHARGE_PATH = `${PAYMENTS_PREFIX}/charge`
/** Refund a settled charge (full or partial). */
export const REFUND_PATH = `${PAYMENTS_PREFIX}/refund`
/** GET payment status (inquiry) by merchant reference number. */
export const STATUS_PATH = `${PAYMENTS_PREFIX}/status/v2`

/**
 * Fawry settles in Egyptian pounds. The status/charge responses do not always
 * echo a currency code, so the transform layer falls back to EGP when absent.
 */
export const DEFAULT_CURRENCY = 'EGP'
