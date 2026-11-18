/**
 * VeraCore REST API constants.
 *
 * Base URL pattern: https://{domain}/VeraCore/Public.Api/api/
 * Auth: two-step — POST /api/login → Bearer token for all subsequent requests.
 *
 * Swagger UI: https://{domain}/VeraCore/Public.Api/swagger/ui/index
 */

/** Placeholder domain — real domain is customer-specific and stored in credentials.extra */
export const VERACORE_API_BASE_TEMPLATE = 'https://{domain}/VeraCore/Public.Api/api'

/** Login endpoint path (relative to the Public.Api root, not the /api prefix) */
export const VERACORE_LOGIN_PATH = 'login'

/** Milliseconds before token expiry to trigger a proactive refresh */
export const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000

/** Default rate limit (conservative estimate for VeraCore) */
export const RATE_LIMIT_RPS = 5
