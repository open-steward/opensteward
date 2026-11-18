/**
 * Clicksign REST API constants.
 *
 * Clicksign is a Brazilian e-signature provider with ICP-Brasil-compatible
 * digital certificates. The platform uses a single API key passed as the
 * `access_token` query-string parameter on every request (rather than a
 * header). Webhooks are signed with HMAC-SHA256 in `Content-Hmac` (hex).
 *
 * Docs: https://developers.clicksign.com/
 */
export const API_BASE_URL = 'https://app.clicksign.com/api/v1'

export const DEFAULT_PAGE_SIZE = 50
export const MAX_PAGE_SIZE = 100
