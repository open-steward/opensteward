/**
 * CoinPayments v2 REST API constants.
 *
 * CoinPayments exposes a single RESTful JSON API for crypto payments under one
 * host — `https://a-api.coinpayments.net/api` — with versioned `/v2/...` paths.
 * There is no separate sandbox host; integrations are tested against the
 * production host using a dedicated test integration's client credentials.
 *
 * Every authenticated request carries three headers plus an HMAC-SHA256
 * signature computed over the request (see `./client.ts`). The merchant
 * resources we map onto the canonical payments vertical live under
 * `/v2/merchant/...`.
 *
 * Docs: https://docs.coinpayments.net/api/
 */
export const API_BASE_URL = 'https://a-api.coinpayments.net/api'

/** Header names CoinPayments requires on every authenticated request. */
export const CLIENT_HEADER = 'X-CoinPayments-Client'
export const TIMESTAMP_HEADER = 'X-CoinPayments-Timestamp'
export const SIGNATURE_HEADER = 'X-CoinPayments-Signature'

/**
 * Byte-order-mark prefix (U+FEFF) prepended to the canonical signing string.
 * CoinPayments signs `BOM + METHOD + URL + clientId + timestamp + body`.
 */
export const SIGNATURE_BOM = '﻿'

/** Default + max page size for `page` / `perPage` offset-paginated lists. */
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 100
