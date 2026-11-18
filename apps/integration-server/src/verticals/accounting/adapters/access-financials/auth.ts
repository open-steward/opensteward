/**
 * Access Financials auth helpers.
 *
 * Access Financials does NOT use a standard OAuth2 authorization-code flow.
 * Authentication is via a long-lived Bearer access token (up to 365 days)
 * combined with an API subscription key, both obtained through the Access ERP
 * Subscription Manager workspace application.
 *
 * Credentials are collected via the Connect Link customForm (see index.ts).
 * The `getAuthUrl` / `exchangeCode` / `refreshCredentials` stubs below are
 * required by the AccountingAdapter interface but are not used in practice:
 * `credentialFields` + `exchangeCredentials` handle credential entry instead.
 */
import type { Credentials } from '../../adapter/interface'

/** Placeholder — Access Financials does not use an OAuth2 authorize URL. */
export function buildAuthUrl(state: string): string {
  // Return a clearly non-functional URL so callers that accidentally trigger
  // the OAuth path surface a visible error rather than a confusing redirect.
  return `https://developer.erp.accessacloud.com/docs/financials/get-started?state=${encodeURIComponent(state)}`
}

/** Placeholder — no authorization-code grant. */
export async function exchangeCode(_code: string): Promise<Credentials> {
  throw new Error('Access Financials uses API token authentication, not OAuth2 authorization codes. Use credentialFields/exchangeCredentials instead.')
}

/**
 * Re-validate the stored credentials.
 *
 * Access Financials tokens do not refresh automatically.  The caller
 * should prompt for a new token when expiry approaches.  Here we simply
 * return the existing credentials unchanged; the token TTL (up to 365 days)
 * is tracked separately via `credentials.expiresAt`.
 */
export async function passthrough(credentials: Credentials): Promise<Credentials> {
  return credentials
}
