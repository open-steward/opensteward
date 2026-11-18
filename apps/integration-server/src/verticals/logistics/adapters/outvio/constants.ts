/**
 * Outvio API constants.
 *
 * Outvio's REST API is accessed via https://api.outvio.com/v1/.
 *
 * The first-party OpenAPI (https://developers.outvio.com/openapi.json) lists
 * the server "https://api.outvio.com" and, for 25 of its 30 operations,
 * sends the key in the JSON request body: "API_KEY": "Outvio client API
 * key.". The other five (POST /v1/order/validate-address, GET
 * /v1/order/batch/{batchId}, POST /v1/order/attachment, GET /courier/list,
 * GET /v1/courier/services/warehouse/{warehouseName}) carry no key in the
 * spec at all. The spec declares no securitySchemes and documents no
 * Authorization header, so the Bearer header the client sends is
 * unverified. Only write methods still use the client, and their paths are
 * not in that spec either.
 */

export const OUTVIO_API_BASE = 'https://api.outvio.com/v1/'

/** Outvio dashboard — API keys management page. */
export const OUTVIO_DASHBOARD_URL = 'https://app.outvio.com/dashboard/settings/api'

/** Outvio does not expose a dedicated webhook-signing secret; webhooks are
 *  authenticated by verifying the request origin IP against Outvio's known
 *  IP range and by requiring the API key in the payload. */
export const OUTVIO_WEBHOOK_SIGNING_HEADER = 'x-outvio-signature'
