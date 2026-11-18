/**
 * Volusion OAuth2 / API-key auth helpers.
 *
 * Volusion V2 storefronts support OAuth2 authorization-code flow. Older V1
 * stores use a static API key passed as a query param. The adapter handles
 * both: if `accessToken` is present it uses Bearer auth; otherwise it falls
 * back to the `apiKey` credential field.
 *
 * Docs: https://developer.volusion.com/
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'

export function buildAuthUrl(
  clientId: string,
  redirectUri: string,
  scopes: string[],
  state: string,
  authBaseUrl: string = 'https://auth.volusion.com',
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: scopes.join(' '),
    state,
  })
  return `${authBaseUrl}/oauth/authorize?${params.toString()}`
}

interface VolusionTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
  scope?: string
}

export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  tokenUrl: string = 'https://auth.volusion.com/oauth/token',
): Promise<Credentials> {
  const { data } = await axios.post<VolusionTokenResponse>(
    tokenUrl,
    {
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    },
  )

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000)
      : undefined,
    scope: data.scope,
  }
}

export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
  tokenUrl: string = 'https://auth.volusion.com/oauth/token',
): Promise<Credentials> {
  const { data } = await axios.post<VolusionTokenResponse>(
    tokenUrl,
    {
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    },
  )

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000)
      : undefined,
    scope: data.scope,
  }
}
