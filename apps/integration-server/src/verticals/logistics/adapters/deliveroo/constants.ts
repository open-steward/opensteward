export const DELIVEROO_API_BASE = 'https://api.developers.deliveroo.com'

export const DELIVEROO_TOKEN_URL_PRODUCTION = 'https://auth.developers.deliveroo.com/oauth2/token'
export const DELIVEROO_TOKEN_URL_SANDBOX = 'https://auth-sandbox.developers.deliveroo.com/oauth2/token'

export const DELIVEROO_DASHBOARD_URL = 'https://developers.deliveroo.com/'

/** Buffer before token expiry to trigger proactive refresh (ms). */
export const TOKEN_REFRESH_BUFFER_MS = 30 * 1000 // 30 seconds (tokens are 300s)

export const RATE_LIMIT_RPS = 10
