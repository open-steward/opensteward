/**
 * Splitit OAuth2 helpers.
 *
 * Splitit uses OAuth2 client-credentials via their ID server (id.production.splitit.com).
 *
 * Docs: https://developers.splitit.com/api/v3/authenticate/
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
    response_type: 'code',
    client_id: clientId,
    scope: scopes.join(' '),
    redirect_uri: redirectUri,
    state,
  })
  return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`
}

interface SplititTokenResponse {
  access_token: string
  refresh_token?: string
  token_type: string
  expires_in?: number
  scope?: string
}

export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<Credentials> {
  const { data } = await axios.post<SplititTokenResponse>(
    OAUTH_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' } },
  )

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    scope: data.scope,
  }
}

export async function refreshCredentials(
  credentials: Credentials,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  if (!credentials.refreshToken) return credentials
  const { data } = await axios.post<SplititTokenResponse>(
    OAUTH_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: credentials.refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' } },
  )
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? credentials.refreshToken,
    scope: data.scope ?? credentials.scope,
    extra: credentials.extra,
  }
}
