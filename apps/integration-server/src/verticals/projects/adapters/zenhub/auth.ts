import type { Credentials } from '@opensteward/shared'
import { TOKEN_HELP_URL } from './constants'

/**
 * ZenHub authenticates with a long-lived Personal API Key sent as
 * `Authorization: Bearer <key>`. There is no OAuth2 authorization-code flow
 * for first-party API access; credentials are collected through the Connect
 * Link form (single-key `simpleApiKey` helper wired up in `index.ts`).
 *
 * The key is stored as `accessToken`.
 */

/** Connect Link form has no redirect URL — point users at the dashboard. */
export function buildAuthUrl(_state: string): string {
  return TOKEN_HELP_URL
}

/**
 * The hosted OAuth path is unused for ZenHub. The Connect Link flow calls
 * `exchangeCredentials` (from `simpleApiKey`) instead. This passthrough exists
 * only to satisfy the `BaseAdapter` contract; it treats the supplied code as
 * the raw Personal API Key.
 */
export async function exchangeCode(code: string): Promise<Credentials> {
  return { accessToken: (code ?? '').trim() }
}

/** ZenHub Personal API Keys are long-lived and do not refresh — return as-is. */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
