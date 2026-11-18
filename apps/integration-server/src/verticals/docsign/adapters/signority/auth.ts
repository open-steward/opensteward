/**
 * Signority auth helpers.
 *
 * Signority does NOT use OAuth — it uses HTTP Basic authentication. An
 * integration supplies its API key as the Basic username with an empty
 * password (`Authorization: Basic base64("<apiKey>:")`). The API key is
 * found under My Account → Profile Settings → Integration and does not
 * expire.
 *
 * The Connect Link flow collects the key via the `simpleApiKey` credential
 * form (wired in index.ts); these helpers back the required BaseAdapter
 * `getAuthUrl` / `exchangeCode` / `refreshCredentials` methods for the
 * direct-credential (non-OAuth) path, storing the key on
 * `credentials.accessToken`.
 *
 * Docs: https://www.signority.com/api-doc/getting-started/
 */

import type { Credentials } from '@opensteward/shared'

/** Where a Signority user generates their API key (no OAuth authorize URL). */
export const API_KEY_SETTINGS_URL =
  'https://sign.signority.com/web/#/profileSetting/integration'

export function buildAuthUrl(_state: string): string {
  // No OAuth — point the operator at the page where the API key is issued.
  return API_KEY_SETTINGS_URL
}

export async function exchangeCode(code: string): Promise<Credentials> {
  // The "code" is the API key itself; store it as the access token.
  return { accessToken: code.trim() }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  // Signority API keys do not expire — return as-is.
  return credentials
}
