import type { Credentials } from '@opensteward/shared'
import { TOKEN_HELP_URL } from './constants'

/**
 * Baserow authenticates with a long-lived personal API token (also called a
 * "database token") sent as `Authorization: Token <key>`. There is no OAuth2
 * authorization-code flow for first-party API access, so credentials are
 * collected through the Connect Link form (a single API-key field via
 * `simpleApiKey`).
 *
 * The token is stored as `accessToken`.
 *
 * Docs: https://baserow.io/user-docs/personal-api-tokens
 */

/** Connect Link has no redirect URL — point users at the token docs. */
export function buildAuthUrl(_state: string): string {
  return TOKEN_HELP_URL
}

/**
 * The hosted OAuth path is unused for Baserow. The Connect Link flow calls
 * `exchangeCredentials` (from `simpleApiKey`) instead. This passthrough treats
 * the supplied code as the raw API token.
 */
export async function exchangeCode(code: string): Promise<Credentials> {
  return { accessToken: (code ?? '').trim() }
}

/** Baserow personal API tokens are long-lived and do not refresh — return as-is. */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
