import type { Credentials } from '@opensteward/shared'
import { API_KEY_HELP_URL } from './constants'

/**
 * Meisterplan authenticates with a long-lived API token sent as the raw value
 * of the `Authorization` header.  The `api-` prefix is part of the token
 * itself (e.g. `api-48eba51e5a8d43ed8a8daeba585b7093`).
 *
 * There is no OAuth2 authorization-code flow.  The token is collected via the
 * Connect Link form (`simpleApiKey` / `customForm`) and stored as
 * `credentials.accessToken`.  The region (us | eu) is captured as
 * `credentials.extra.region` so the client can build the correct base URL.
 */

/** Connect Link has no redirect URL — point users to the token docs. */
export function buildAuthUrl(_state: string): string {
  return API_KEY_HELP_URL
}

/**
 * The hosted OAuth path is not used for Meisterplan.  The Connect Link flow
 * calls `exchangeCredentials` (from the credential template) instead.  This
 * passthrough satisfies the `BaseAdapter` contract; it treats the supplied
 * code as the raw API token.
 */
export async function exchangeCode(code: string): Promise<Credentials> {
  return { accessToken: (code ?? '').trim() }
}

/** Meisterplan API tokens are long-lived and do not expire — return as-is. */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
