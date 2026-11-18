/**
 * Salla OAuth2 helpers.
 *
 * Salla uses a standard authorization-code OAuth2 flow. The authorize endpoint
 * lives at accounts.salla.sa and the token endpoint accepts both
 * `authorization_code` and `refresh_token` grant types.
 *
 * Access tokens expire after 14 days. Refresh tokens are single-use and expire
 * after 1 month; each refresh issues a new refresh token.
 *
 * All API calls use:  Authorization: Bearer <access_token>
 *
 * Docs: https://docs.salla.dev/421118m0
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { SALLA_AUTHORIZE_URL, SALLA_TOKEN_URL } from './constants'

export function buildAuthUrl(
  clientId: string,
  redirectUri: string,
  scopes: string[],
  state: string,
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: scopes.join(' '),
    state,
  })
  return `${SALLA_AUTHORIZE_URL}?${params.toString()}`
}

interface SallaTokenResponse {
  access_token: string
  refresh_token?: string
  /** Seconds until access token expiry (RFC 6749 § 5.1, typically 1209599 = ~14 days). */
  expires_in?: number
  scope?: string
  token_type?: string
}

export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<Credentials> {
  const { data } = await axios.post<SallaTokenResponse>(
    SALLA_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    },
  )

  const expiresAt = data.expires_in
    ? new Date(Date.now() + data.expires_in * 1000)
    : undefined

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt,
    scope: data.scope,
  }
}

export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const { data } = await axios.post<SallaTokenResponse>(
    SALLA_TOKEN_URL,
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

  const expiresAt = data.expires_in
    ? new Date(Date.now() + data.expires_in * 1000)
    : undefined

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt,
    scope: data.scope,
  }
}
