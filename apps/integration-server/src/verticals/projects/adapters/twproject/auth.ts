import type { Credentials } from '@opensteward/shared'
import { TOKEN_HELP_URL } from './constants'

/**
 * Twproject authenticates API calls with a long-lived API key sent inside
 * the JSON POST request body as `APIKey`. There is no OAuth2 authorization-
 * code flow; the Connect Link form in `index.ts` collects the key and the
 * server URL.
 *
 * The API key is stored as `accessToken`. The customer server base URL is
 * stored in `extra.serverUrl`.
 */

/** No redirect URL — direct users to the API documentation page. */
export function buildAuthUrl(_state: string): string {
  return TOKEN_HELP_URL
}

/**
 * The Connect Link flow calls `exchangeCredentials` (the form in `index.ts`).
 * This passthrough satisfies the `BaseAdapter` contract; it treats the
 * supplied code as the raw API key.
 */
export async function exchangeCode(code: string): Promise<Credentials> {
  return { accessToken: (code ?? '').trim() }
}

/** Twproject API keys are long-lived and do not expire — return as-is. */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
