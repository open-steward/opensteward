/**
 * Production host. Every Kushki spec lists it under `servers` as "API —
 * Producción"; UAT is https://api-uat.kushkipagos.com, which this adapter has
 * no setting to select.
 */
export const API_BASE_URL = 'https://api.kushkipagos.com'

/**
 * GET /analytics/v2/transactions-list
 * (https://api-docs.kushkipagos.com/mexico/online-payments/analytics/transactions-list-v2.md):
 * "The maximum number of transactions you can query per request is `600`."
 */
export const TRANSACTIONS_LIST_MAX_LIMIT = 600

/** Same page: "In case the `limit` parameter is not included in the request, the maximum number of transations that will be returned is `100`." */
export const TRANSACTIONS_LIST_DEFAULT_LIMIT = 100
