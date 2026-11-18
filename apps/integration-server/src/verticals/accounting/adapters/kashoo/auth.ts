import axios from 'axios'
import { KASHOO_AUTH_URL, KASHOO_TOKEN_URL } from './constants'
import type { Credentials } from '../../adapter/interface'

// Kashoo supports OAuth2 for third-party access.
// Register your app at https://app.kashoo.com to get client_id and client_secret.

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
  return `${KASHOO_AUTH_URL}?${params.toString()}`
}

function parseTokenResponse(data: Record<string, unknown>): Credentials {
  return {
    accessToken: data['access_token'] as string,
    refreshToken: data['refresh_token'] as string | undefined,
    expiresAt: data['expires_in']
      ? new Date(Date.now() + (data['expires_in'] as number) * 1000)
      : undefined,
    scope: data['scope'] as string | undefined,
  }
}

export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<Credentials> {
  const { data } = await axios.post<Record<string, unknown>>(
    KASHOO_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  )
  return parseTokenResponse(data)
}

export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const { data } = await axios.post<Record<string, unknown>>(
    KASHOO_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  )
  const creds = parseTokenResponse(data)
  if (!creds.refreshToken) creds.refreshToken = refreshToken
  return creds
}
