/**
 * fabric auth — API key + OAuth2 client-credentials flow.
 *
 * fabric uses a combination of an API key (passed as `x-api-key` header) and
 * an OAuth2 client-credentials grant for Bearer tokens. The API key identifies
 * the merchant account; the OAuth2 token authorises API access.
 *
 * Token endpoint: `POST https://api.fabric.inc/v3/oauth/token`
 * Body: `{ grant_type: 'client_credentials', client_id, client_secret }`
 *
 * Credentials shape:
 *   { accessToken, expiresAt, extra: { apiKey, clientId, clientSecret } }
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { BASE_URL, TOKEN_ENDPOINT, TOKEN_LIFETIME_SECONDS } from './constants'

interface FabricTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
}

export function getAuthUrl(): string {
  return 'https://developer.fabric.inc/dashboard/api-keys'
}

export function exchangeCode(): Promise<Credentials> {
  throw new Error(
    'fabric uses API key + OAuth2 client-credentials — no authorization code exchange. ' +
      'POST credentials to /v1/connections with body ' +
      '`{platform: "fabric", credentials: {apiKey, clientId, clientSecret}}`. ' +
      'The adapter bootstraps tokens automatically via refreshCredentials.',
  )
}

/**
 * Fetch a new access token using client-credentials grant.
 */
export async function fetchToken(
  clientId: string,
  clientSecret: string,
): Promise<{ accessToken: string; expiresAt: Date }> {
  const url = `${BASE_URL}${TOKEN_ENDPOINT}`
  const res = await axios.post<FabricTokenResponse>(
    url,
    {
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    },
    {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30_000,
    },
  )
  if (!res.data.access_token) {
    throw new Error('fabric token endpoint returned an empty access_token')
  }
  return {
    accessToken: res.data.access_token,
    expiresAt: new Date(Date.now() + (res.data.expires_in ?? TOKEN_LIFETIME_SECONDS) * 1000),
  }
}

/**
 * Refresh credentials by re-running the client-credentials grant.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const clientId = credentials.extra?.['clientId'] as string | undefined
  const clientSecret = credentials.extra?.['clientSecret'] as string | undefined

  if (!clientId || !clientSecret) {
    throw new Error(
      'fabric refreshCredentials requires clientId and clientSecret in credentials.extra.',
    )
  }
  const { accessToken, expiresAt } = await fetchToken(clientId, clientSecret)
  return {
    ...credentials,
    accessToken,
    expiresAt,
  }
}
