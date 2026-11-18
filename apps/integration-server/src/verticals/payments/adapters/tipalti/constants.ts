/**
 * Tipalti REST API constants.
 *
 * Tipalti exposes two environments. The version segment is pinned to `v1`,
 * the current GA of the modern REST API (payees / payments / invoices /
 * payment batches).
 *
 *   Sandbox:    https://api-sb.tipalti.com/api/v1
 *   Production: https://api-p.tipalti.com/api/v1
 *
 * Authentication is OAuth2 client-credentials (OpenID Connect): a
 * `clientId` + `clientSecret` minted under Administration → API integration
 * are POSTed to the token endpoint for a short-lived Bearer access token.
 * Sandbox and production share the same hosted IdP issuer.
 */
export const API_VERSION = 'v1'

export const SANDBOX_API_BASE_URL = `https://api-sb.tipalti.com/api/${API_VERSION}`
export const PRODUCTION_API_BASE_URL = `https://api-p.tipalti.com/api/${API_VERSION}`

/** OAuth2 client-credentials token endpoints (OpenID Connect). */
export const SANDBOX_TOKEN_URL = 'https://sso.sandbox.tipalti.com/connect/token'
export const PRODUCTION_TOKEN_URL = 'https://sso.tipalti.com/connect/token'

/** Default scope granting read/write access to the REST resources. */
export const DEFAULT_SCOPE = 'tipalti.api'

/** Cursor pagination: `page-size` query param. Default 100, max 200. */
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 200

export type TipaltiEnvironment = 'sandbox' | 'production'

export function apiBaseUrl(env: TipaltiEnvironment): string {
  return env === 'production' ? PRODUCTION_API_BASE_URL : SANDBOX_API_BASE_URL
}

export function tokenUrl(env: TipaltiEnvironment): string {
  return env === 'production' ? PRODUCTION_TOKEN_URL : SANDBOX_TOKEN_URL
}

// ── Resource paths ──────────────────────────────────────────────────────────
export const PAYEES_PATH = '/payees'
export const PAYMENTS_PATH = '/payments'
export const INVOICES_PATH = '/invoices'

export function payeePath(id: string): string {
  return `${PAYEES_PATH}/${encodeURIComponent(id)}`
}
export function paymentPath(id: string): string {
  return `${PAYMENTS_PATH}/${encodeURIComponent(id)}`
}
export function invoicePath(id: string): string {
  return `${INVOICES_PATH}/${encodeURIComponent(id)}`
}
