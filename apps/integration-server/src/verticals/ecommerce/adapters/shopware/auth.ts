/**
 * Shopware 6 auth helpers.
 *
 * Shopware 6 integrations use OAuth2 client-credentials:
 *
 *   POST /api/oauth/token
 *   { grant_type: "client_credentials", client_id: "...", client_secret: "..." }
 *
 *   → { access_token, token_type: "Bearer", expires_in: 600 }
 *
 * There is no user-facing authorize URL for server-to-server access;
 * integrations are created in the Shopware admin under
 * Settings > System > Integrations.
 *
 * Credentials flow:
 *  - `getAuthUrl` points at the Shopware admin integrations page.
 *  - `exchangeCode` is not applicable — callers POST connection
 *    credentials with `{baseUrl, clientId, clientSecret}`.
 *  - `refreshCredentials` re-calls the token endpoint with stored
 *    client_id / client_secret from `credentials.extra`.
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { TOKEN_LIFETIME_MS } from './constants'

export function buildAuthUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}/admin#/sw/integration/index`
}

export function exchangeCode(): Promise<Credentials> {
  throw new Error(
    'Shopware 6 does not use OAuth code exchange. ' +
      'POST credentials to /v1/connections with body ' +
      '`{platform: "shopware", credentials: {baseUrl, clientId, clientSecret}}`. ' +
      'The adapter fetches access tokens automatically via refreshCredentials.',
  )
}

/**
 * Call Shopware's OAuth token endpoint with client credentials.
 */
export async function fetchAccessToken(
  baseUrl: string,
  clientId: string,
  clientSecret: string,
): Promise<{ accessToken: string; expiresIn: number }> {
  const url = `${baseUrl.replace(/\/$/, '')}/api/oauth/token`
  const res = await axios.post<{
    access_token: string
    token_type: string
    expires_in: number
  }>(
    url,
    {
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    },
    {
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      timeout: 30_000,
    },
  )
  if (!res.data.access_token) {
    throw new Error('Shopware token endpoint returned an empty access_token')
  }
  return {
    accessToken: res.data.access_token,
    expiresIn: res.data.expires_in ?? 600,
  }
}

/**
 * Refresh credentials by calling the OAuth token endpoint.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const baseUrl = credentials.extra?.['baseUrl'] as string | undefined
  const clientId = credentials.extra?.['clientId'] as string | undefined
  const clientSecret = credentials.extra?.['clientSecret'] as string | undefined
  if (!baseUrl || !clientId || !clientSecret) {
    throw new Error(
      'Shopware refreshCredentials requires baseUrl, clientId, and clientSecret ' +
        'in credentials.extra — none were found. Re-create the connection with the ' +
        'required fields.',
    )
  }
  const { accessToken } = await fetchAccessToken(baseUrl, clientId, clientSecret)
  return {
    ...credentials,
    accessToken,
    expiresAt: new Date(Date.now() + TOKEN_LIFETIME_MS),
  }
}
