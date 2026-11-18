/**
 * Production server from the reference's embedded OpenAPI
 * (https://developers.muralpay.com/reference/searchpayoutrequests.md):
 * "servers": [{ "description": "Production", "url": "https://api.muralpay.com" },
 * { "description": "Sandbox", "url": "https://api-staging.muralpay.com" }].
 * Every documented path carries its own "/api/..." prefix; there is no "/v1".
 */
export const API_BASE_URL = 'https://api.muralpay.com'
/** The row pager's scope label: one Mural host, no per-connection account id. */
export const API_HOST = 'api.muralpay.com'
/**
 * Page size when the caller sends none. The search endpoints' `limit` is
 * `{"type":"number"}` with no documented maximum, so no ceiling is applied.
 */
export const DEFAULT_PAGE_SIZE = 50
