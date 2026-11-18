import type { Credentials } from '@opensteward/shared'
import { TOKEN_HELP_URL } from './constants'

/**
 * TAPD authenticates via HTTP Basic Auth using an application ID (api_user)
 * and application secret (api_password) registered on the TAPD open platform.
 * There is no OAuth2 authorization-code flow for first-party API access, so
 * credentials are collected through the Connect Link form (the two-field
 * `customForm` helper wired up in `index.ts`).
 *
 * Both values are stored together in `accessToken` as `apiUser:apiPassword`
 * so the client can decode them for the Basic Auth header.
 */

/** Connect Link form has no redirect URL — point users at the token docs. */
export function buildAuthUrl(_state: string): string {
  return TOKEN_HELP_URL
}

/**
 * The hosted OAuth path is unused for TAPD. The Connect Link flow calls
 * `exchangeCredentials` (from `customForm`) instead. This passthrough exists
 * only to satisfy the `BaseAdapter` contract; it treats the supplied code as
 * a raw `apiUser:apiPassword` pair.
 */
export async function exchangeCode(code: string): Promise<Credentials> {
  return { accessToken: (code ?? '').trim() }
}

/** TAPD API credentials are long-lived and do not refresh — return as-is. */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
