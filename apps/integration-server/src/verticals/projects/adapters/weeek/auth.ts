import type { Credentials } from '@opensteward/shared'
import { TOKEN_HELP_URL } from './constants'

/**
 * Weeek authenticates with a long-lived personal API token sent as
 * `Authorization: Bearer <token>`.  There is no OAuth2 authorization-code
 * flow for first-party API access; credentials are collected through the
 * Connect Link form (a single-key `simpleApiKey` helper wired in index.ts).
 *
 * The token is stored as `accessToken`.
 */

/** Redirect users to the API-token settings page. */
export function buildAuthUrl(_state: string): string {
  return TOKEN_HELP_URL
}

/**
 * Treat the supplied code as the raw API token (passthrough for the
 * BaseAdapter contract; Connect Link flow uses `exchangeCredentials`).
 */
export async function exchangeCode(code: string): Promise<Credentials> {
  return { accessToken: (code ?? '').trim() }
}

/** Weeek API tokens are long-lived and do not expire — return as-is. */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
