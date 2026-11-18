import type { Credentials } from '@opensteward/shared'
import { TOKEN_HELP_URL } from './constants'

/**
 * NocoDB authenticates with a long-lived personal API token (Nano ID, prefix
 * `nc_pat_`) sent as the `xc-token` header. There is no OAuth2
 * authorization-code flow, so credentials are collected through the Connect
 * Link form (single API-key field via `simpleApiKey`).
 *
 * The token is stored as `accessToken`.
 *
 * Docs: https://nocodb.com/docs/product-docs/account-settings/api-tokens
 */

/** Connect Link has no redirect URL — point users at the token docs. */
export function buildAuthUrl(_state: string): string {
  return TOKEN_HELP_URL
}

/**
 * No hosted OAuth path for NocoDB. The Connect Link flow calls
 * `exchangeCredentials` (from `simpleApiKey`) instead. This passthrough
 * treats the supplied code as the raw API token.
 */
export async function exchangeCode(code: string): Promise<Credentials> {
  return { accessToken: (code ?? '').trim() }
}

/** NocoDB personal API tokens are long-lived and do not refresh — return as-is. */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
