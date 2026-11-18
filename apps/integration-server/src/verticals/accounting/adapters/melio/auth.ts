import axios from 'axios'
import { MELIO_AUTH_URL, MELIO_TOKEN_URL } from './constants'
import type { Credentials } from '../../adapter/interface'
import { basicAuth } from '@opensteward/shared'

export function buildAuthUrl(
  clientId: string,
  redirectUri: string,
  scopes: string[],
  state: string,
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes.join(' '),
    state,
  })
  return `${MELIO_AUTH_URL}?${params.toString()}`
}

function parseTokenResponse(data: Record<string, unknown>): Credentials {
  return {
    accessToken: data['access_token'] as string,
    refreshToken: (data['refresh_token'] as string | undefined) || undefined,
    expiresAt: typeof data['expires_in'] === 'number'
      ? new Date(Date.now() + (data['expires_in'] as number) * 1000)
      : undefined,
    scope: (data['scope'] as string | undefined) || undefined,
  }
}

export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<Credentials> {
  const { data } = await axios.post<Record<string, unknown>>(
    MELIO_TOKEN_URL,
    new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
    {
      headers: {
        Authorization: `Basic ${basicAuth(clientId, clientSecret)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    },
  )
  return parseTokenResponse(data)
}

export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const { data } = await axios.post<Record<string, unknown>>(
    MELIO_TOKEN_URL,
    new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    {
      headers: {
        Authorization: `Basic ${basicAuth(clientId, clientSecret)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    },
  )
  const creds = parseTokenResponse(data)
  if (!creds.refreshToken) creds.refreshToken = refreshToken
  return creds
}
