/**
 * Cafe24 OAuth2 helpers.
 *
 * Cafe24's OAuth is per-mall: the authorize and token endpoints live on the
 * mall's own `{mallId}.cafe24api.com` host.
 *
 * Token lifecycle:
 *   - Access tokens expire after 2 hours.
 *   - Refresh tokens are valid for 2 weeks.
 *   - Each refresh issues a new refresh token (rolling window).
 *
 * Docs: https://developers.cafe24.com/docs/en/api/admin/#oauth
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { oauthBaseUrl } from './constants'

export function buildAuthUrl(
  mallId: string,
  clientId: string,
  redirectUri: string,
  scopes: string[],
  state: string,
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes.join(','),
    state,
  })
  return `${oauthBaseUrl(mallId)}/authorize?${params.toString()}`
}

interface Cafe24TokenResponse {
  access_token: string
  refresh_token?: string
  expires_at?: string // ISO-8601 timestamp when access_token expires
  token_type?: string
  scopes?: string | string[]
  mall_id?: string
}

function parseScopes(raw: string | string[] | undefined): string | undefined {
  if (!raw) return undefined
  if (Array.isArray(raw)) return raw.join(',')
  return raw
}

export async function exchangeCode(
  mallId: string,
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<Credentials> {
  const { data } = await axios.post<Cafe24TokenResponse>(
    `${oauthBaseUrl(mallId)}/token`,
    new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    },
  )

  const expiresAt = data.expires_at ? new Date(data.expires_at) : undefined

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt,
    scope: parseScopes(data.scopes),
  }
}

export async function refreshAccessToken(
  mallId: string,
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const { data } = await axios.post<Cafe24TokenResponse>(
    `${oauthBaseUrl(mallId)}/token`,
    new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    },
  )

  const expiresAt = data.expires_at ? new Date(data.expires_at) : undefined

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt,
    scope: parseScopes(data.scopes),
  }
}
