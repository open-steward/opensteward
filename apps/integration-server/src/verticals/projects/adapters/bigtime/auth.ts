import type { Credentials } from '@opensteward/shared'
import { TOKEN_HELP_URL } from './constants'

/**
 * BigTime authenticates with a firm-level API token. Firm tokens are
 * permanent and act as admin-level access; there is no OAuth2 authorization-
 * code flow for the data API, so credentials are collected through the Connect
 * Link form (see the `customForm` helper wired up in `index.ts`):
 *
 *   - `firmId` — the firm (realm) id, sent in the `X-Auth-Realm` header.
 *   - `apiKey` — the permanent firm API token, sent in `X-Auth-Token`.
 *
 * The token is stored as `accessToken`; the firm id is stored on
 * `credentials.extra.firmId` and supplied as the realm header on every call.
 */

/** Connect Link form has no redirect URL — point users at the token docs. */
export function buildAuthUrl(_state: string): string {
  return TOKEN_HELP_URL
}

/**
 * The hosted OAuth path is unused for BigTime. The Connect Link flow calls
 * `exchangeCredentials` (from `customForm`) instead. This passthrough exists
 * only to satisfy the `BaseAdapter` contract; it treats the supplied code as
 * the raw firm API token.
 */
export async function exchangeCode(code: string): Promise<Credentials> {
  return { accessToken: (code ?? '').trim() }
}

/** BigTime firm API tokens are permanent and do not refresh — return as-is. */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
