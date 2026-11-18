import axios from 'axios'
import { SILVERFIN_AUTH_URL, SILVERFIN_TOKEN_BASE_URL } from './constants'
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
  return `${SILVERFIN_AUTH_URL}?${params.toString()}`
}


function parseTokenResponse(data: Record<string, unknown>, firmId?: string): Credentials {
  return {
    accessToken: data['access_token'] as string,
    refreshToken: data['refresh_token'] as string | undefined,
    expiresAt: new Date(Date.now() + (data['expires_in'] as number) * 1000),
    scope: data['scope'] as string | undefined,
    // Store firm_id returned in OAuth2 redirect for use in API calls
    extra: firmId ? { firmId } : undefined,
  }
}

export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
  firmId: string,
): Promise<Credentials> {
  // In Silverfin v4, the token endpoint requires the firm_id in the path
  const tokenUrl = `${SILVERFIN_TOKEN_BASE_URL}/f/${firmId}/oauth/token`
  const { data } = await axios.post<Record<string, unknown>>(
    tokenUrl,
    new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
    {
      headers: {
        Authorization: `Basic ${basicAuth(clientId, clientSecret)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    },
  )
  return parseTokenResponse(data, firmId)
}

export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
  firmId: string,
): Promise<Credentials> {
  // In Silverfin v4, the token endpoint requires the firm_id in the path
  const tokenUrl = `${SILVERFIN_TOKEN_BASE_URL}/f/${firmId}/oauth/token`
  const { data } = await axios.post<Record<string, unknown>>(
    tokenUrl,
    new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    {
      headers: {
        Authorization: `Basic ${basicAuth(clientId, clientSecret)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    },
  )
  const creds = parseTokenResponse(data, firmId)
  if (!creds.refreshToken) creds.refreshToken = refreshToken
  return creds
}
