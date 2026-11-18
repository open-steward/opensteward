/**
 * Magento "auth" helpers.
 *
 * Magento does NOT use OAuth2's authorization-code flow for server-to-
 * server REST access. Admin integration tokens are minted by POSTing the
 * admin username/password to `/rest/V1/integration/admin/token`, which
 * returns the bare bearer token as a JSON string:
 *
 *   POST /rest/V1/integration/admin/token
 *   { "username": "admin", "password": "..." }
 *
 *   → "h7wybtgltd4ndjqffzsv7rkbgnrkfb0y"
 *
 * Credentials flow:
 *
 *  - `getAuthUrl` points at the admin "Create Integration" page for
 *    humans, but the adapter itself uses the token endpoint.
 *  - `exchangeCode` is not applicable and throws with a descriptive
 *    error instead — callers must POST `{baseUrl, adminUsername,
 *    adminPassword}` to `/v1/connections`, and the adapter bootstraps
 *    the token lazily via `refreshCredentials`.
 *  - `refreshCredentials` re-calls the token endpoint with the
 *    stored username/password from `credentials.extra`. The plaintext
 *    password must remain in `extra` (encrypted at rest by
 *    `CredentialStore`) for the token to be refreshable.
 *
 * Docs: https://developer.adobe.com/commerce/webapi/rest/tutorials/prerequisite-tasks/
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { TOKEN_LIFETIME_MS } from './constants'

export function buildAuthUrl(baseUrl: string): string {
  // Informational redirect — NOT a functional OAuth authorize URL.
  return `${baseUrl.replace(/\/$/, '')}/admin/admin/integration/new/`
}

export function exchangeCode(): Promise<Credentials> {
  throw new Error(
    'Magento does not use OAuth code exchange. ' +
      'POST credentials to /v1/connections with body ' +
      '`{platform: "magento", credentials: {baseUrl, adminUsername, adminPassword}}`. ' +
      'The adapter bootstraps admin integration tokens automatically via refreshCredentials.',
  )
}

/**
 * Call Magento's admin token endpoint with the supplied username +
 * password, returning a fresh token string. The endpoint returns the
 * bare token as a JSON string (quoted), e.g. `"h7wyb…"`.
 */
export async function fetchAdminToken(
  baseUrl: string,
  username: string,
  password: string,
): Promise<string> {
  const url = `${baseUrl.replace(/\/$/, '')}/rest/V1/integration/admin/token`
  const res = await axios.post<string>(
    url,
    { username, password },
    {
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      timeout: 30_000,
      // Magento returns a raw JSON string — axios will parse it to a
      // plain string automatically.
      responseType: 'json',
    },
  )
  const token = typeof res.data === 'string' ? res.data : String(res.data)
  if (!token) {
    throw new Error('Magento admin token endpoint returned an empty token')
  }
  return token
}

/**
 * Refresh credentials by calling the admin token endpoint. Requires the
 * baseUrl + username + password to be present in `credentials.extra`.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const baseUrl = credentials.extra?.['baseUrl'] as string | undefined
  const username = credentials.extra?.['adminUsername'] as string | undefined
  const password = credentials.extra?.['adminPassword'] as string | undefined
  if (!baseUrl || !username || !password) {
    throw new Error(
      'Magento refreshCredentials requires baseUrl, adminUsername, and adminPassword ' +
        'in credentials.extra — none were found. Re-create the connection with the ' +
        'required fields.',
    )
  }
  const token = await fetchAdminToken(baseUrl, username, password)
  return {
    ...credentials,
    accessToken: token,
    expiresAt: new Date(Date.now() + TOKEN_LIFETIME_MS),
  }
}
