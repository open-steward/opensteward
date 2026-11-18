/**
 * Bambora (North America) Payment APIs constants.
 *
 * Bambora NA — formerly Beanstream, now part of Worldline — exposes a single
 * REST host. There is no separate sandbox hostname: test vs. live is decided
 * by the merchant account whose ID + passcode are encoded into the auth
 * header, so the same base URL serves both.
 *
 * Docs: https://dev.na.bambora.com/docs/references/payment_APIs/
 */
export const API_BASE_URL = 'https://api.na.bambora.com/v1'

/**
 * Bambora settles in the merchant account's configured currency and does not
 * echo a currency code on the payment response, so we default to CAD (the most
 * common Bambora NA settlement currency) when none is supplied.
 */
export const DEFAULT_CURRENCY = 'CAD'

/**
 * `POST /reports` (transaction search) returns at most 500 rows per window:
 * "If the difference between start and end rows is greater than 500, only the
 * top 500 records will be retrieved."
 */
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 500
