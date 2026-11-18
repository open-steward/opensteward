/**
 * Shipday API constants.
 *
 * Base URL: https://api.shipday.com
 * Auth:     HTTP Basic – API key sent as username with no password.
 *           Header: Authorization: Basic base64(<API_KEY>:)
 */
export const SHIPDAY_API_BASE = 'https://api.shipday.com/'
export const SHIPDAY_DASHBOARD_URL = 'https://dispatch.shipday.com'
export const SHIPDAY_PLATFORM = 'shipday' as const
