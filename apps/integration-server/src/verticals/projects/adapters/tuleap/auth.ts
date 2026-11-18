import type { Credentials } from '@opensteward/shared'
import { API_KEY_HELP_URL } from './constants'

/**
 * Tuleap authenticates with a long-lived personal access key sent in the
 * `X-Auth-AccessKey` HTTP request header. Keys look like `tlp.k1.<payload>`.
 *
 * There is no OAuth2 authorization-code flow. Credentials are collected
 * through the Connect Link form (`simpleApiKey` wired up in `index.ts`).
 *
 * The API key is stored as `credentials.accessToken`; the HTTP client puts it
 * into the `X-Auth-AccessKey` header on every request.
 *
 * Tuleap is self-hosted, so the instance base URL is also supplied at
 * connection time and stored in `credentials.extra.host`.
 */

/** Connect Link has no redirect URL — point users at the API key docs. */
export function buildAuthUrl(_state: string): string {
  return API_KEY_HELP_URL
}

/**
 * The hosted OAuth path is unused. This passthrough satisfies the
 * `BaseAdapter` contract; it treats the code as the raw API key.
 */
export async function exchangeCode(code: string): Promise<Credentials> {
  return { accessToken: (code ?? '').trim() }
}

/** Tuleap personal access keys are long-lived and do not expire — return as-is. */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
