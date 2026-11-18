/**
 * Solidgate base URLs, from https://api-docs.solidgate.com/api/get-started:
 * "The v1 API uses domain-specific base URLs, except for endpoints for
 * managing webhooks and files." and "Using an action with the wrong base URL
 * results in a Blocked by WAF error."
 */
/** "https://pay.solidgate.com/api/v1 Card payments" */
export const PAY_BASE_URL = 'https://pay.solidgate.com/api/v1'
/** "https://subscriptions.solidgate.com/api/v1 Subscriptions" (products and prices live here). */
export const SUBSCRIPTIONS_BASE_URL = 'https://subscriptions.solidgate.com/api/v1'
/** "https://reports.solidgate.com/api/v1 Reports" */
export const REPORTS_BASE_URL = 'https://reports.solidgate.com/api/v1'

/** Reports `limit`: "integer [ 1 .. 2000 ]", "default 2000". */
export const REPORT_MAX_LIMIT = 2000
/** GET /products and GET /products/{product_id}/prices `pagination[limit]`: "[ 1 .. 100 ]", default 10. */
export const CATALOG_MAX_LIMIT = 100
export const DEFAULT_PAGE_SIZE = 50
