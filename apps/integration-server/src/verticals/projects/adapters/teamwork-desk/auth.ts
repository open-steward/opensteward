import type { Credentials } from '@opensteward/shared'
import { TOKEN_HELP_URL } from './constants'

/**
 * Teamwork Spaces authenticates with a long-lived API key sent as
 * `Authorization: Bearer <apiKey>`. There is no OAuth2 authorization-code
 * flow for the Spaces product's first-party API; credentials are collected
 * through the Connect Link form (the `simpleApiKey` helper wired in
 * `index.ts`).
 *
 * The API key is stored as `accessToken`.
 * The user's site URL (e.g. `https://mycompany.teamwork.com`) is stored in
 * `credentials.extra.siteUrl` and is required to build per-request base URLs.
 */

/** Connect Link form has no redirect URL — point users at the API-key docs. */
export function buildAuthUrl(_state: string): string {
  return TOKEN_HELP_URL
}

/**
 * The hosted OAuth path is unused for Teamwork Spaces. The Connect Link flow
 * calls `exchangeCredentials` (from `simpleApiKey`) instead. This passthrough
 * exists only to satisfy the `BaseAdapter` contract; it treats the supplied
 * code as the raw API key.
 */
export async function exchangeCode(code: string): Promise<Credentials> {
  return { accessToken: (code ?? '').trim() }
}

/** Teamwork Spaces API keys are long-lived and do not refresh — return as-is. */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
