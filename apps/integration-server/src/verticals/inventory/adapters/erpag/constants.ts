/**
 * ERPAG REST API constants.
 *
 * Auth: api_key + api_secret, sent as Authorization: Basic base64(apiKey:apiSecret).
 * Rate limit: 2 requests/second per ERPAG documentation.
 */
export const API_BASE_URL = 'https://api.erpag.com'

/**
 * ERPAG's list endpoints return arrays of IDs only; there is no server-side
 * page parameter documented. We cap the number of IDs we resolve per call so
 * that memory stays bounded when a caller passes a limit.
 */
export const DEFAULT_PAGE_SIZE = 100
