import type { Credentials } from '@opensteward/shared'
import { API_KEY_HELP_URL } from './constants'

/**
 * MantisBT authenticates with a long-lived API token sent in the
 * `Authorization` HTTP request header (raw token, no "Bearer" prefix).
 *
 * There is no OAuth2 authorization-code flow. Credentials are collected
 * through the Connect Link form (`simpleApiKey` wired up in `index.ts`).
 *
 * The token is stored as `credentials.accessToken`; the HTTP client puts it
 * directly into the `Authorization` header on every request.
 *
 * Additionally, MantisBT is self-hosted, so the base URL (host) is also
 * supplied at connection time and stored in `credentials.extra.host`.
 */

/** Connect Link has no redirect URL — point users at the API token docs. */
export function buildAuthUrl(_state: string): string {
  return API_KEY_HELP_URL
}

/**
 * The hosted OAuth path is unused. This passthrough satisfies the
 * `BaseAdapter` contract; it treats the code as the raw API token.
 */
export async function exchangeCode(code: string): Promise<Credentials> {
  return { accessToken: (code ?? '').trim() }
}

/** MantisBT API tokens are long-lived and do not expire — return as-is. */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
