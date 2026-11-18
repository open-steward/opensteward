/** Deliverect REST API — production base URL */
export const DELIVERECT_API_BASE = 'https://api.deliverect.com'

/** Deliverect staging base URL (used when NODE_ENV !== 'production') */
export const DELIVERECT_API_BASE_STAGING = 'https://api.staging.deliverect.com'

/** OAuth2 token endpoint — same host as API */
export const DELIVERECT_TOKEN_URL = `${DELIVERECT_API_BASE}/oauth/token`
export const DELIVERECT_TOKEN_URL_STAGING = `${DELIVERECT_API_BASE_STAGING}/oauth/token`

/** OAuth2 audience values */
export const DELIVERECT_AUDIENCE = 'https://api.deliverect.com'
export const DELIVERECT_AUDIENCE_STAGING = 'https://api.staging.deliverect.com'

/** Developer portal URL shown for auth redirect */
export const DELIVERECT_DASHBOARD_URL = 'https://app.deliverect.com'

/** Token cache safety buffer: refresh 60 s before expiry */
export const TOKEN_EXPIRY_BUFFER_MS = 60_000

/** Default token TTL (Deliverect issues 3600 s tokens) */
export const TOKEN_DEFAULT_TTL_MS = 3_600_000
