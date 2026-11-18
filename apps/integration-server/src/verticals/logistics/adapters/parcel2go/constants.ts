/**
 * Parcel2Go API constants.
 *
 * Base URLs:
 *   Production:  https://www.parcel2go.com/api
 *   Sandbox:     https://sandbox.parcel2go.com/api
 *
 * Auth (OpenID Connect / OAuth2 client_credentials):
 *   Production token URL:  https://www.parcel2go.com/auth/connect/token
 *   Sandbox token URL:     https://sandbox.parcel2go.com/auth/connect/token
 *   Scopes: "public-api payment"
 */

export const PARCEL2GO_API_BASE = 'https://www.parcel2go.com/api'
export const PARCEL2GO_AUTH_TOKEN_URL = 'https://www.parcel2go.com/auth/connect/token'

export const PARCEL2GO_SANDBOX_API_BASE = 'https://sandbox.parcel2go.com/api'
export const PARCEL2GO_SANDBOX_AUTH_TOKEN_URL = 'https://sandbox.parcel2go.com/auth/connect/token'

// The Swagger's per-operation security lists "openid" on all 42 operations
// (GET /services: [public-api, openid]), but "openid" is not among the scopes
// its securityDefinitions declare, and that definition describes only an
// implicit grant, never client_credentials. Left unchanged: nothing documents
// that a client_credentials token request accepts "openid".
export const PARCEL2GO_SCOPES = ['public-api', 'payment']

export const PARCEL2GO_DASHBOARD_URL = 'https://www.parcel2go.com/smart-send'

/**
 * Rows asked of GET /services per request: its documented default,
 * take — "Number of services to get (default 50)." No maximum is documented,
 * so the walk never asks for more than the default.
 */
export const SERVICES_PAGE_SIZE = 50

/** Guard on the whole-catalogue walk: 100 × 50 = 5,000 services, then throw. */
export const MAX_SERVICES_PAGES = 100
