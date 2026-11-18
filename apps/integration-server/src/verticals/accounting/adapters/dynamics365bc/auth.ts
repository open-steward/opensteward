import axios from 'axios'
import { getAuthUrl, getTokenUrl } from './constants'
import type { Credentials } from '../../adapter/interface'

export function buildAuthUrl(
  clientId: string,
  redirectUri: string,
  scopes: string[],
  state: string,
  tenantId = 'common',
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes.join(' '),
    state,
    response_mode: 'query',
  })
  return `${getAuthUrl(tenantId)}?${params.toString()}`
}

function parseTokenResponse(data: Record<string, unknown>): Credentials {
  return {
    accessToken: data['access_token'] as string,
    refreshToken: data['refresh_token'] as string | undefined,
    expiresAt: new Date(Date.now() + (data['expires_in'] as number) * 1000),
    tenantId: data['tenant_id'] as string | undefined,
  }
}

export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  tenantId = 'common',
): Promise<Credentials> {
  const { data } = await axios.post<Record<string, unknown>>(
    getTokenUrl(tenantId),
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
  tenantId = 'common',
): Promise<Credentials> {
  const { data } = await axios.post<Record<string, unknown>>(
    getTokenUrl(tenantId),
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
