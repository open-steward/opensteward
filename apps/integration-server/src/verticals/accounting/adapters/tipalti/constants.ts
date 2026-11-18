/**
 * Tipalti REST API constants.
 *
 * Tipalti exposes two environments. The version segment is pinned to `v1`,
 * the current GA of the modern REST API.
 *
 *   Production: https://api-p.tipalti.com/api/v1
 *   Sandbox:    https://api-sb.tipalti.com/api/v1
 *
 * Authentication is OAuth2 client-credentials (OpenID Connect): a
 * `clientId` + `clientSecret` minted under Administration → API integration
 * are POSTed to the token endpoint for a short-lived Bearer access token.
 *
 * Docs: https://documentation.tipalti.com/docs/getting-started
 */

export const API_VERSION = 'v1'

export const TIPALTI_API_BASE = `https://api-p.tipalti.com/api/${API_VERSION}`
export const TIPALTI_SANDBOX_API_BASE = `https://api-sb.tipalti.com/api/${API_VERSION}`

/** OAuth2 client-credentials token endpoints (OpenID Connect). */
export const TIPALTI_TOKEN_URL = 'https://sso.tipalti.com/connect/token'
export const TIPALTI_SANDBOX_TOKEN_URL = 'https://sso.sandbox.tipalti.com/connect/token'

export type TipaltiEnvironment = 'sandbox' | 'production'

export function apiBaseUrl(env: TipaltiEnvironment): string {
  return env === 'production' ? TIPALTI_API_BASE : TIPALTI_SANDBOX_API_BASE
}

export function tokenUrl(env: TipaltiEnvironment): string {
  return env === 'production' ? TIPALTI_TOKEN_URL : TIPALTI_SANDBOX_TOKEN_URL
}

/**
 * Scopes requested on the client-credentials token call, space-separated as
 * the token endpoint expects ("The scopes are separated by a space",
 * https://documentation.tipalti.com/reference/step-1-retrieve-access-token).
 *
 * Tipalti documents no bare `tipalti.api` scope — every scope is
 * `tipalti.api.<resource>.<read|write>`
 * (https://documentation.tipalti.com/reference/access-scopes). These are the
 * documented read scopes for the resources this adapter reads. The payer's
 * Developer Hub app must have them enabled. Write scopes are deliberately not
 * requested, so create/update calls need the app's write scopes added here.
 */
export const DEFAULT_SCOPE = [
  'tipalti.api.gl-account.read',
  'tipalti.api.invoice.read',
  'tipalti.api.payee.read',
  'tipalti.api.payer-entity.read',
  'tipalti.api.payment.read',
  'tipalti.api.tax-code.read',
].join(' ')

// Pagination — Tipalti rejects page-size > 200 with HTTP 400.
export const DEFAULT_PAGE_SIZE = 100
export const MAX_PAGE_SIZE = 200

// ── Resource paths ────────────────────────────────────────────────────────────
export const PAYEES_PATH = '/payees'
export const PAYMENTS_PATH = '/payments'
export const INVOICES_PATH = '/invoices'
export const GL_ACCOUNTS_PATH = '/gl-accounts'
export const ENTITIES_PATH = '/entities'
export const TAX_CODES_PATH = '/tax-codes'
