/**
 * "servers": [{"url": "https://shipping-api.com/app/api/v1", "description":
 * "Production API Server"}] (https://shipping-api.com/api/v1?api-docs-v1.json,
 * the spec behind the Swagger UI the Shipmozo panel links as its API
 * documentation). "Ensure that the API URL does not have a trailing slash".
 */
export const SHIPMOZO_API_BASE = 'https://shipping-api.com/app/api/v1'

/**
 * The merchant panel. The API documentation PDF: the keys are found by
 * "Logging into the panel and checking the user profile section, where the
 * public-key and private-key are provided."
 */
export const SHIPMOZO_DASHBOARD_URL = 'https://panel.shipmozo.com/login'

/**
 * GET /get-warehouses: "If you have more than 25 records, pass page number
 * (For next 25 records)". The endpoint takes no page-size parameter.
 */
export const WAREHOUSE_PAGE_SIZE = 25
