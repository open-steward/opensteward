import type { Credentials } from '@opensteward/shared'
import { API_KEY_HELP_URL } from './constants'

/**
 * Kaiten authenticates with a long-lived personal API token sent as a Bearer
 * token.  There is no OAuth2 authorization-code flow; credentials are collected
 * through the Connect Link form (a `customForm` with `baseUrl` + `apiKey`
 * wired in `index.ts`).
 *
 * The token is stored as `credentials.accessToken`; the tenant base URL is
 * stored as `credentials.extra.baseUrl`.  The HTTP client sets the token in
 * the `Authorization: Bearer <token>` header on every request.
 */

/** Connect Link form has no redirect URL — point users at the API-token docs. */
export function buildAuthUrl(_state: string): string {
  return API_KEY_HELP_URL
}

/**
 * The hosted OAuth path is unused for Kaiten.  The Connect Link flow calls
 * `exchangeCredentials` (from `customForm`) instead.  This passthrough exists
 * only to satisfy the `BaseAdapter` contract; it treats the supplied code as the
 * raw API token and leaves `extra` empty (no base URL available in this path).
 */
export async function exchangeCode(code: string): Promise<Credentials> {
  return { accessToken: (code ?? '').trim() }
}

/** Kaiten API tokens are long-lived and do not refresh — return as-is. */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
