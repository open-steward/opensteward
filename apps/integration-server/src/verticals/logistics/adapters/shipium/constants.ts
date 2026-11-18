/**
 * Shipium API constants.
 *
 * Shipium uses Basic Authentication: base64(apiKeyId:apiKey)
 * https://docs.shipium.com/docs/authentication
 */

export const SHIPIUM_API_BASE = 'https://api.shipium.com/api/v1'

export const SHIPIUM_DASHBOARD_URL = 'https://go.shipium.com'

// Shipium rate-limits are not publicly documented; use conservative defaults.
export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100
