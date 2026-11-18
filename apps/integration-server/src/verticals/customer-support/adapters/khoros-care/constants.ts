/**
 * Khoros Care REST API constants.
 *
 * The Care API (v1/v2) is served from the customer's own instance host:
 *   https://{instance}.response.lithium.com/api/v2
 *
 * The company key and the regional gateways (api.app.lithium.com,
 * api-eu.app.lithium.com) belong to the separate Care Analytics / v3 APIs,
 * which this adapter does not call.
 *
 * Docs: https://developer.khoros.com/khoroscaredevdocs/reference/care-apis
 */

/** Host suffix of every Care API instance. */
export const API_HOST_SUFFIX = 'response.lithium.com'

export const API_BASE_URL_TEMPLATE = 'https://{instance}.response.lithium.com/api/v2'
