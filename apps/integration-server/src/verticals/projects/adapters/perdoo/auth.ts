import type { Credentials } from '@opensteward/shared'
import { TOKEN_HELP_URL } from './constants'

/**
 * Perdoo authenticates with a long-lived bearer token sent as
 * `Authorization: Bearer {token}`. The token is generated from
 * Personal Settings → Integrations; there is no OAuth2 flow.
 * Credentials are collected through the Connect Link form (`simpleApiKey`).
 *
 * The token is stored as `accessToken`.
 */

/** Connect Link form has no redirect URL — point users at the token docs. */
export function buildAuthUrl(_state: string): string {
  return TOKEN_HELP_URL
}

/**
 * No hosted OAuth path for Perdoo. Treats the supplied code as the raw
 * API bearer token to satisfy the `BaseAdapter` contract.
 */
export async function exchangeCode(code: string): Promise<Credentials> {
  return { accessToken: (code ?? '').trim() }
}

/** Perdoo bearer tokens are long-lived and do not refresh — return as-is. */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
