/**
 * Paytm Payment Gateway (PG) — India-anchored gateway.
 *
 * Paytm exposes two long-lived environments. The merchant picks one at
 * Connect time; the choice rides in `Credentials.extra.environment`.
 *   - staging    → https://securegw-stage.paytm.in
 *   - production → https://securegw.paytm.in
 *
 * Every server-to-server call POSTs a JSON envelope of the shape
 * `{ head: { signature }, body: {...} }`; the `signature` is a Paytm
 * checksum (see ./checksum.ts) computed over the `body` with the merchant key.
 */
export const HOSTS = {
  staging: 'https://securegw-stage.paytm.in',
  production: 'https://securegw.paytm.in',
} as const

export type PaytmEnvironment = keyof typeof HOSTS
export const DEFAULT_ENVIRONMENT: PaytmEnvironment = 'staging'

/** Request-envelope `head` defaults Paytm expects on the v3 status call. */
export const HEAD_VERSION = 'v1'
export const HEAD_CHANNEL_ID = 'WEB'

/** Resource paths (host-relative to `HOSTS` above). */
export const TXN_STATUS_PATH = '/v3/order/status'
export const REFUND_APPLY_PATH = '/refund/apply'
export const REFUND_STATUS_PATH = '/v2/refund/status'

/**
 * The Order List and Refund List APIs are documented on a *different* host
 * (`secure(stage).paytmpayments.com`) than `HOSTS` above
 * (`securegw(-stage).paytm.in`), which the already-built status/refund
 * endpoints use successfully today. The vendor docs also describe those
 * already-working endpoints as living on this host, but whether
 * `/merchant-passbook/*` is in turn also served on the legacy `securegw`
 * host is not settled either way — so rather than move the working
 * endpoints onto an unverified host, only the two new list endpoints (which
 * have no working host to preserve) are pointed at the one the docs give.
 *
 * `PaytmClient.merchantPassbookUrl()` resolves a path against this map; pass
 * the resulting absolute URL to `PaytmClient.post()`, which honours an
 * absolute URL over its own `baseURL`.
 */
export const MERCHANT_PASSBOOK_HOSTS = {
  staging: 'https://securestage.paytmpayments.com',
  production: 'https://secure.paytmpayments.com',
} as const

/** Order List API — POST, CHECKSUM-signed, `head.tokenType: 'CHECKSUM'`. */
export const ORDER_LIST_PATH = '/merchant-passbook/search/list/order/v2'
/** Refund List API — POST, CHECKSUM-signed, `head.tokenType: 'CHECKSUM'`
 *  (+ optional `head.clientId` for multi-key merchants); flat response, no
 *  `{head,body}` envelope. */
export const REFUND_LIST_PATH = '/merchant-passbook/api/v1/refundList'

/** Order List: vendor-documented default `pageSize` when unspecified. */
export const DEFAULT_ORDER_LIST_PAGE_SIZE = 20
/** Refund List: vendor-documented default `pageSize` when unspecified. */
export const DEFAULT_REFUND_LIST_PAGE_SIZE = 20
/** Refund List: vendor-documented per-page cap ("upto 50 records" per page). */
export const MAX_REFUND_LIST_PAGE_SIZE = 50
/** Both list endpoints cap a single query's date range to 30 days; used to
 *  default the window when the caller supplies no `updatedAfter`. */
export const LIST_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

/** Paytm quotes money in major units (rupees); default settlement currency. */
export const DEFAULT_CURRENCY = 'INR'
