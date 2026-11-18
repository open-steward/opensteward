import type { Credentials } from '@opensteward/shared'
import { API_KEY_HELP_URL } from './constants'

/**
 * Paymo authenticates with a long-lived API key sent via HTTP Basic auth (the
 * key is the username; the password is ignored). There is no OAuth2
 * authorization-code flow, so credentials are collected through the Connect
 * Link form (the `simpleApiKey` helper wired up in `index.ts`).
 *
 * The key is stored as `credentials.accessToken`; the HTTP client encodes it
 * into the `Authorization: Basic …` header on every request.
 */

/** Connect Link form has no redirect URL — point users at the API-key docs. */
export function buildAuthUrl(_state: string): string {
  return API_KEY_HELP_URL
}

/**
 * The hosted OAuth path is unused for Paymo. The Connect Link flow calls
 * `exchangeCredentials` (from `simpleApiKey`) instead. This passthrough exists
 * only to satisfy the `BaseAdapter` contract; it treats the supplied code as
 * the raw API key.
 */
export async function exchangeCode(code: string): Promise<Credentials> {
  return { accessToken: (code ?? '').trim() }
}

/** Paymo API keys are long-lived and do not refresh — return as-is. */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
