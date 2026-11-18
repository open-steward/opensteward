export const API_BASE_URL = 'https://apiprod.fattlabs.com'
export const DEFAULT_PAGE_SIZE = 50
/**
 * GET /payment-method per_page: "The maximum is 200 and the minimum is 1."
 * https://docs.staxpayments.com/reference/get-all-payment-methods-for-a-merchant
 */
export const PAYMENT_METHOD_MAX_PER_PAGE = 200
/**
 * GET /transaction per_page: "Number of results per page (min: 1, max: 200)."
 * https://docs.staxpayments.com/reference/list-and-filter-all-transactions
 */
export const TRANSACTION_MAX_PER_PAGE = 200
