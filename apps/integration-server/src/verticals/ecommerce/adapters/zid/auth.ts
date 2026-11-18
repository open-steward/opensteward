/**
 * Zid OAuth 2.0 helpers.
 *
 * Zid implements the standard authorization code grant. Tokens are issued by
 * oauth.zid.sa. Access tokens expire in ~1 year; a refresh token with the same
 * lifespan is returned alongside the access token.
 *
 * After a successful install Zid returns both an `access_token` (used as
 * `Authorization: Bearer`) and a `refresh_token`. The adapter stores both in
 * `Credentials` so that `refreshCredentials` can obtain a new access token
 * when the old one expires.
 *
 * Docs: https://docs.zid.sa/authorization
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { OAUTH_AUTHORIZE_URL, OAUTH_TOKEN_URL } from './constants'

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
    state,
  })
  if (scopes.length > 0) {
    params.set('scope', scopes.join(' '))
  }
  return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`
}

interface ZidTokenResponse {
  access_token: string
  refresh_token?: string
  token_type?: string
  expires_in?: number
  scope?: string
}

export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<Credentials> {
  const { data } = await axios.post<ZidTokenResponse>(
    OAUTH_TOKEN_URL,
    {
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    },
  )

  const expiresAt =
    data.expires_in != null
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
  redirectUri: string,
): Promise<Credentials> {
  const { data } = await axios.post<ZidTokenResponse>(
    OAUTH_TOKEN_URL,
    {
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      redirect_uri: redirectUri,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    },
  )

  const expiresAt =
    data.expires_in != null
      ? new Date(Date.now() + data.expires_in * 1000)
      : undefined

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt,
    scope: data.scope,
  }
}
