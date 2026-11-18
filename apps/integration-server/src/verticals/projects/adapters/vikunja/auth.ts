import type { Credentials } from '@opensteward/shared'
import { TOKEN_HELP_URL } from './constants'

/**
 * Vikunja authenticates with a long-lived API token sent as
 * `Authorization: Bearer <token>`. There is no OAuth2 authorization-code
 * flow for first-party API access, so credentials are collected through the
 * Connect Link form (the `simpleApiKey` / `customForm` helper wired up in
 * `index.ts`).
 *
 * The token is stored as `accessToken`; `baseUrl` (optional, for self-hosted
 * instances) is kept in `extra.baseUrl`.
 */

/** Connect Link has no redirect URL — point users at the token docs. */
export function buildAuthUrl(_state: string): string {
  return TOKEN_HELP_URL
}

/**
 * The hosted OAuth path is unused for Vikunja. The Connect Link flow calls
 * `exchangeCredentials` (from the credential form) instead. This passthrough
 * exists only to satisfy the `BaseAdapter` contract; it treats the supplied
 * code as the raw API token.
 */
export async function exchangeCode(code: string): Promise<Credentials> {
  return { accessToken: (code ?? '').trim() }
}

/** Vikunja API tokens are long-lived and do not refresh — return as-is. */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
