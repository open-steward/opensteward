import type { Credentials } from '@opensteward/shared'
import { TOKEN_HELP_URL } from './constants'

/**
 * Rocketlane authenticates with a long-lived API key sent as the `api-key`
 * HTTP header. Keys are generated from the Rocketlane app under
 * Profile → Settings → API → Create API key. There is no OAuth2
 * authorization-code flow, so credentials are collected through the Connect
 * Link form (see the `simpleApiKey` helper wired up in `index.ts`).
 *
 * The key is stored as `accessToken`.
 */

/** Connect Link form has no redirect URL — point users at the token docs. */
export function buildAuthUrl(_state: string): string {
  return TOKEN_HELP_URL
}

/**
 * The hosted OAuth path is unused for Rocketlane. The Connect Link flow calls
 * `exchangeCredentials` (from `simpleApiKey`) instead. This passthrough exists
 * only to satisfy the `BaseAdapter` contract; it treats the supplied code as
 * the raw API key.
 */
export async function exchangeCode(code: string): Promise<Credentials> {
  return { accessToken: (code ?? '').trim() }
}

/** Rocketlane API keys are long-lived and do not refresh — return as-is. */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
