export const API_BASE_URL = 'https://api.mollie.com/v2'
export const DEFAULT_PAGE_SIZE = 100
/**
 * Mollie's documented page maximum: every list endpoint's `limit` is
 * "minimum 1, maximum 250, default 50" (https://docs.mollie.com/reference/pagination:
 * "The maximum number of objects returned is 250.").
 *
 * Not declared as `capabilities.maxPageSize`: listBalanceTransactions,
 * listPaymentMethods and listSubscriptions do not page yet, so the paged
 * methods clamp to it themselves and report the size they sent.
 */
export const MAX_PAGE_SIZE = 250
