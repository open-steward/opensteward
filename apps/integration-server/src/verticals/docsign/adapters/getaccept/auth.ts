/**
 * GetAccept OAuth helpers.
 *
 * GetAccept uses a hybrid OAuth flow: the authorize endpoint follows the
 * standard authorization-code shape, but the token exchange POSTs to
 * `/v1/auth` instead of an `/oauth/token` path. The exchange body is
 * x-www-form-urlencoded with `client_id`/`client_secret`/`grant_type`.
 *
 * Docs: https://developers.getaccept.com/?version=v1#authentication
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
    redirect_uri: redirectUri,
    state,
  })
  if (scopes.length > 0) params.set('scope', scopes.join(' '))
  return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`
}

interface GetAcceptTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
  scope?: string
}

export async function exchangeCode(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const { data } = await axios.post<GetAcceptTokenResponse>(
    OAUTH_TOKEN_URL,
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
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: typeof data.expires_in === 'number'
      ? new Date(Date.now() + data.expires_in * 1000)
      : undefined,
    scope: data.scope,
    extra: {},
  }
}

export async function refreshCredentials(
  credentials: Credentials,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  if (!credentials.refreshToken) return credentials
  const { data } = await axios.post<GetAcceptTokenResponse>(
    OAUTH_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: credentials.refreshToken,
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
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? credentials.refreshToken,
    expiresAt: typeof data.expires_in === 'number'
      ? new Date(Date.now() + data.expires_in * 1000)
      : credentials.expiresAt,
    scope: data.scope ?? credentials.scope,
    extra: credentials.extra ?? {},
  }
}
