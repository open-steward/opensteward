/**
 * Shopware B2B Suite auth helpers.
 *
 * Identical to base Shopware 6 — OAuth2 client-credentials against
 * `/api/oauth/token`. B2B Suite is an extension on the same host.
 *
 * Re-exports from the base Shopware adapter for DRY.
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { TOKEN_LIFETIME_MS } from './constants'

export function buildAuthUrl(baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}/admin#/sw/integration/index`
}

export function exchangeCode(): Promise<Credentials> {
  throw new Error(
    'Shopware B2B Suite does not use OAuth code exchange. ' +
      'POST credentials to /v1/connections with body ' +
      '`{platform: "shopware-b2b", credentials: {baseUrl, clientId, clientSecret}}`. ' +
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
      'Shopware B2B refreshCredentials requires baseUrl, clientId, and clientSecret ' +
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
