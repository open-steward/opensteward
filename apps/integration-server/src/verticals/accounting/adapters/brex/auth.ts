/**
 * Brex OAuth 2.0 helpers.
 *
 * Docs: https://developer.brex.com/guides/partner_authentication
 *
 * - Authorization URL: https://accounts-api.brex.com/oauth2/default/v1/authorize
 * - Token URL:         https://accounts-api.brex.com/oauth2/default/v1/token
 * - Access tokens expire in 3600 s; refresh tokens expire in 90 days.
 */

import axios from 'axios'
import { BREX_AUTH_URL, BREX_TOKEN_URL } from './constants'
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
  return `${BREX_AUTH_URL}?${params.toString()}`
}

function parseTokenResponse(data: Record<string, unknown>): Credentials {
  return {
    accessToken: data['access_token'] as string,
    refreshToken: data['refresh_token'] as string | undefined,
    expiresAt: new Date(Date.now() + (data['expires_in'] as number) * 1000),
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
    BREX_TOKEN_URL,
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
    BREX_TOKEN_URL,
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
