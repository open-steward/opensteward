/**
 * Ongoing WMS Goods Owner REST API constants.
 *
 * Auth: HTTP Basic (username + password), warehouse code passed via URL path.
 * Base URL template: https://api.ongoingsystems.se/{warehouse}/api/v1/
 * Demo URL template:  https://wms1.ongoingsystems.se/{warehouse}/api/v1/
 */

/** Production base URL — {warehouse} placeholder is replaced at runtime. */
export const API_BASE_URL_TEMPLATE = 'https://api.ongoingsystems.se/{warehouse}/api/v1'

/** Demo base URL template for sandbox/test warehouses. */
export const API_BASE_URL_DEMO_TEMPLATE = 'https://wms1.ongoingsystems.se/{warehouse}/api/v1'

/** Default max articles/orders per request (API default is unlimited but we cap for safety). */
export const DEFAULT_PAGE_SIZE = 100
