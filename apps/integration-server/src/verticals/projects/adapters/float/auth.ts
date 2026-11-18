import type { Credentials } from '@opensteward/shared'
import { TOKEN_HELP_URL } from './constants'

/**
 * Float authenticates with a long-lived access token sent as
 * `Authorization: Bearer {token}`. The token is generated from the user's
 * Float Account Settings → Integrations page; there is no OAuth2
 * authorization-code flow, so credentials are collected through the Connect
 * Link form (see the `simpleApiKey` helper wired up in `index.ts`).
 *
 * The token is stored as `accessToken`.
 */

/** Connect Link form has no redirect URL — point users at the token docs. */
export function buildAuthUrl(_state: string): string {
  return TOKEN_HELP_URL
}

/**
 * The hosted OAuth path is unused for Float. The Connect Link flow calls
 * `exchangeCredentials` (from `simpleApiKey`) instead. This passthrough exists
 * only to satisfy the `BaseAdapter` contract; it treats the supplied code as
 * the raw API access token.
 */
export async function exchangeCode(code: string): Promise<Credentials> {
  return { accessToken: (code ?? '').trim() }
}

/** Float access tokens are long-lived and do not refresh — return as-is. */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
