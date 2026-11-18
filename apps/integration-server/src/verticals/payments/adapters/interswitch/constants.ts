/**
 * Interswitch (Quickteller Business / payment gateway) API constants.
 *
 * Every value here is quoted from https://docs.interswitchgroup.com:
 *
 * - Token URL — docs/payouts.md: "Passport Production URL:
 *   https://passport.interswitchng.com/passport/oauth/token". The
 *   authentication guide (docs/authentication.md) shows the same path on the
 *   sandbox host with `grant_type=client_credentials`.
 * - API host — the payment-gateway reference pages are served from
 *   `https://sandbox.interswitchng.com`, and the web-checkout guide
 *   (docs/web-checkout.md) gives that host's live counterpart as
 *   "LIVE BASE URL: https://webpay.interswitchng.com".
 * - Transactions — reference/get-transactions.md: `GET
 *   /paymentgateway/api/v1/transactions`, "Search for transactions done over
 *   a period".
 */

export const API_BASE_URL = 'https://webpay.interswitchng.com'
export const TOKEN_URL = 'https://passport.interswitchng.com/passport/oauth/token'

export const TRANSACTIONS_PATH = '/paymentgateway/api/v1/transactions'

/**
 * `pageSize` is required on GET /paymentgateway/api/v1/transactions and no
 * default or maximum is documented for it. The sibling refunds list
 * (reference/get-refund.md) documents `"pageSize" … "default": "100"`, which
 * is the size used when a caller sends no limit.
 */
export const DEFAULT_PAGE_SIZE = 100

/**
 * ISO 4217 numeric → alphabetic, for the numeric `currencyCode` the
 * transactions list returns (`"currencyCode": "566"`). Only the codes the
 * docs name are listed — docs/frequently-asked-questions.md, "What currency
 * codes are supported today?": "NGN = 566", "UGX = 800", "KES = 404",
 * "DRC = 976", "USD = 840". The DRC entry names the country rather than the
 * currency; 976 is the ISO 4217 numeric code of the Congolese franc (CDF),
 * the standard every other code in that answer follows.
 */
export const NUMERIC_CURRENCIES: Readonly<Record<string, string>> = {
  '566': 'NGN',
  '800': 'UGX',
  '404': 'KES',
  '840': 'USD',
  '976': 'CDF',
}
