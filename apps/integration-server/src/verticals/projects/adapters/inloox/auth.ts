import type { Credentials } from '@opensteward/shared'
import { TOKEN_HELP_URL } from './constants'

/**
 * InLoox authenticates via a Personal Access Token (PAT) sent as the
 * `x-api-key` header on every request. There is no OAuth2 authorization-code
 * flow for the public OData API; credentials are collected through the
 * Connect Link form (a single API-key field via `simpleApiKey`).
 *
 * The PAT is stored as `accessToken`.
 *
 * Token generation: https://login.inloox.com/Manage/PersonalAccessToken
 */

/** Connect Link has no redirect URL — point users at the PAT generation page. */
export function buildAuthUrl(_state: string): string {
  return TOKEN_HELP_URL
}

/**
 * The hosted OAuth path is unused for InLoox. The Connect Link flow calls
 * `exchangeCredentials` (from `simpleApiKey`) instead. This passthrough treats
 * the supplied code as the raw PAT token.
 */
export async function exchangeCode(code: string): Promise<Credentials> {
  return { accessToken: (code ?? '').trim() }
}

/** InLoox personal access tokens are long-lived and do not refresh — return as-is. */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
