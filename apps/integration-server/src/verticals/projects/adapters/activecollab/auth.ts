import type { Credentials } from '@opensteward/shared'
import { TOKEN_HELP_URL } from './constants'

/**
 * ActiveCollab authenticates with a long-lived API token sent in the
 * `X-Angie-AuthApiToken` header. There is no OAuth2 authorization-code flow,
 * so credentials are collected through the Connect Link form (see the
 * `customForm` helper wired up in `index.ts`):
 *
 *   - `accountId` — the numeric cloud instance id (from the dashboard URL),
 *     or the full origin of a self-hosted instance.
 *   - `apiKey`    — the API token issued from the user's account.
 *
 * The token is stored as `accessToken`; the account id is stored on
 * `credentials.extra.accountId` and used to build the per-account base URL.
 */

/** Connect Link form has no redirect URL — point users at the token docs. */
export function buildAuthUrl(_state: string): string {
  return TOKEN_HELP_URL
}

/**
 * The hosted OAuth path is unused for ActiveCollab. The Connect Link flow
 * calls `exchangeCredentials` (from `customForm`) instead. This passthrough
 * exists only to satisfy the `BaseAdapter` contract; it treats the supplied
 * code as the raw API token.
 */
export async function exchangeCode(code: string): Promise<Credentials> {
  return { accessToken: (code ?? '').trim() }
}

/** ActiveCollab API tokens are long-lived and do not refresh — return as-is. */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
