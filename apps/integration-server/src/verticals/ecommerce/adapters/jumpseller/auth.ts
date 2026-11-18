/**
 * Jumpseller OAuth 2 helpers.
 *
 * Jumpseller uses the standard Authorization Code grant flow.
 * - Authorize URL:  https://accounts.jumpseller.com/oauth/authorize
 * - Token URL:      https://accounts.jumpseller.com/oauth/token
 * - Access tokens expire after 1 hour; refresh tokens are long-lived.
 * - API requests use `Authorization: Bearer <access_token>`.
 *
 * Docs: https://jumpseller.com/support/oauth-2/
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { OAUTH_AUTHORIZE_URL, OAUTH_TOKEN_URL, DEFAULT_SCOPES } from './constants'

export function buildAuthUrl(
  clientId: string,
  redirectUri: string,
  scopes: string[],
  state: string,
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    state,
  })
  return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`
}

interface JumpsellerTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token?: string
  created_at?: number
  scope?: string
}

export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<Credentials> {
  const { data } = await axios.post<JumpsellerTokenResponse>(
    OAUTH_TOKEN_URL,
    new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    },
  )

  // Access tokens expire in 1 hour (3600 s).
  const expiresAt = data.expires_in
    ? new Date(Date.now() + data.expires_in * 1000)
    : undefined

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt,
    scope: data.scope ?? DEFAULT_SCOPES.join(' '),
  }
}

export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const { data } = await axios.post<JumpsellerTokenResponse>(
    OAUTH_TOKEN_URL,
    new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    },
  )

  const expiresAt: Date | undefined = data.expires_in
    ? new Date(Date.now() + data.expires_in * 1000)
    : undefined

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt,
    scope: data.scope,
  }
}
