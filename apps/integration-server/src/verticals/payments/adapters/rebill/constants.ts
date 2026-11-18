/**
 * Every endpoint in the API reference is on this host, e.g. "List customers":
 * GET https://api.rebill.com/v3/customers
 * (https://docs.rebill.com/api/reference/customers).
 */
export const API_BASE_URL = 'https://api.rebill.com/v3'

/**
 * "Records per page. Defaults to `10`. Max `100`." (List customers), and
 * "`limit` defaults to `10` (max `100`)" (Search plans), "Items per page.
 * Defaults to `10`, max `100`." (List subscriptions).
 */
export const DEFAULT_PAGE_SIZE = 10
export const MAX_PAGE_SIZE = 100
