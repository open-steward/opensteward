/**
 * Zyro / Hostinger OAuth2 helpers.
 *
 * Zyro uses Hostinger's OAuth2 infrastructure. The authorization URL is
 * `https://api.hostinger.com/oauth/authorize` and the token endpoint is
 * `https://api.hostinger.com/oauth/token`. Both authorization_code and
 * refresh_token grant types are supported.
 *
 * Docs: https://developers.hostinger.com (Hostinger API reference)
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { AUTH_URL, TOKEN_URL, TOKEN_LIFETIME_SECONDS, DEFAULT_SCOPES } from './constants'

interface ZyroTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
}

/**
 * Build the OAuth2 authorization URL. Redirect the user to this URL to begin
 * the consent flow.
 */
export function getAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string,
  scopes: string[] = DEFAULT_SCOPES,
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    scope: scopes.join(' '),
  })
  return `${AUTH_URL}?${params.toString()}`
}

/**
 * Exchange an authorization code for an access + refresh token pair.
 */
export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<Credentials> {
  const { data } = await axios.post<ZyroTokenResponse>(
    TOKEN_URL,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    },
  )

  const expiresIn = data.expires_in ?? TOKEN_LIFETIME_SECONDS
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + expiresIn * 1000),
  }
}

/**
 * Refresh an expired access token using the stored refresh token.
 */
export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const { data } = await axios.post<ZyroTokenResponse>(
    TOKEN_URL,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    },
  )

  const expiresIn = data.expires_in ?? TOKEN_LIFETIME_SECONDS
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: new Date(Date.now() + expiresIn * 1000),
  }
}
