export const API_BASE_URL = 'https://api.nowpayments.io/v1'
export const DEFAULT_PAGE_SIZE = 50

/**
 * GET /v1/payment/ ("Get list of payments"): "limit - number of records in
 * one page. (possible values: from 1 to 500)". No other list documents a
 * maximum, so this is not an adapter-wide capability.
 */
export const PAYMENT_LIST_MAX_LIMIT = 500
