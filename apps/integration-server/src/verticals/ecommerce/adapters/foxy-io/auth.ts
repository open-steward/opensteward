/**
 * Foxy.io OAuth2 authorization-code flow helpers.
 *
 * Foxy uses a standard OAuth2 authorization-code grant:
 *  - Authorize: https://auth.foxy.io/authorize
 *  - Token:     https://api.foxycart.com/token
 *
 * Access tokens expire after 2 hours. Refresh tokens are valid for 10 years.
 * Call `refreshAccessToken` when the stored `expiresAt` is in the past.
 *
 * Docs: https://api.foxycart.com/docs/authentication/thirdparty
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { AUTH_URL, TOKEN_URL } from './constants'

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
  return `${AUTH_URL}?${params.toString()}`
}

interface FoxyTokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  token_type: string
  scope?: string
}

function credentialsFromResponse(data: FoxyTokenResponse, fallbackRefreshToken?: string): Credentials {
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? fallbackRefreshToken,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    scope: data.scope,
  }
}

const TOKEN_HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded',
  Accept: 'application/json',
}

export async function exchangeCode(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const { data } = await axios.post<FoxyTokenResponse>(
    TOKEN_URL,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
    { headers: TOKEN_HEADERS },
  )
  return credentialsFromResponse(data)
}

export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const { data } = await axios.post<FoxyTokenResponse>(
    TOKEN_URL,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
    { headers: TOKEN_HEADERS },
  )
  return credentialsFromResponse(data, refreshToken)
}
