/**
 * Fieldwire API constants.
 *
 * Auth endpoint is non-regionalized; project data endpoints are regionalized
 * (US default). Adjust API_BASE_URL per deployment region.
 *
 * Docs: https://developers.fieldwire.com/docs/getting-started
 */

/** Non-regionalized account/auth endpoint */
export const AUTH_BASE_URL = 'https://client-api.super.fieldwire.com'

/** JWT exchange endpoint — POST {api_token} → {access_token} */
export const JWT_ENDPOINT = `${AUTH_BASE_URL}/api_keys/jwt`

/** Default regionalized REST base (US) */
export const API_BASE_URL = 'https://client-api.us.fieldwire.com/api/v3'

/** Account-scoped project list endpoint (non-regionalized) */
export const ACCOUNT_API_BASE_URL = 'https://client-api.super.fieldwire.com/api/v3'

/** Fieldwire-Version header value required on all requests */
export const API_VERSION = '2023-11-30'

/** Default items per page (Fieldwire max: 1000) */
export const DEFAULT_PAGE_SIZE = 100

/** `Fieldwire-Per-Page` maximum ("default: 50, max: 1000"), https://developers.fieldwire.com/docs/pagination */
export const MAX_PAGE_SIZE = 1000
