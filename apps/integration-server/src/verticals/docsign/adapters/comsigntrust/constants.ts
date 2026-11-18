/**
 * ComsignTrust WeSign REST API constants.
 *
 * WeSign publishes its OpenAPI on the production host:
 *   https://wse.comsigntrust.com/api/swagger/v3/swagger.json
 *   "servers": [{ "url": "/api" }], paths under "/v3/..."
 * so every documented operation lives under https://wse.comsigntrust.com/api/v3.
 */
export const API_BASE_URL = 'https://wse.comsigntrust.com/api/v3'

/**
 * `GET /v3/DocumentCollections` declares `limit` with `"default": 20`. No
 * maximum is documented, so the caller's limit is sent unclamped.
 */
export const DEFAULT_PAGE_SIZE = 20
