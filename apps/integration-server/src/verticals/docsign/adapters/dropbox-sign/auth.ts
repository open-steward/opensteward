/**
 * Dropbox Sign OAuth helpers.
 *
 * Standard OAuth 2.0 Authorization Code Grant.
 *
 * Docs: https://developers.hellosign.com/api/reference/operation/oauthTokenGenerate/
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { OAUTH_AUTHORIZE_URL, OAUTH_TOKEN_URL } from './constants'

export function buildAuthUrl(
  clientId: string,
  _redirectUri: string,
  scopes: string[],
  state: string,
): string {
  // Dropbox Sign does not echo redirect_uri in the authorize URL — it uses
  // the app's pre-registered callback. `state` is still required for CSRF.
  const params = new URLSearchParams({
    client_id: clientId,
    state,
    scope: scopes.join(','),
  })
  return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`
}

interface DropboxSignTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
  account_id?: string
}

export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const { data } = await axios.post<DropboxSignTokenResponse>(
    OAUTH_TOKEN_URL,
    new URLSearchParams({
      state: 'noop',
      code,
      grant_type: 'authorization_code',
      client_id: clientId,
      secret: clientSecret,
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' } },
  )
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    extra: { accountId: data.account_id },
  }
}

export async function refreshCredentials(
  credentials: Credentials,
  clientSecret: string,
): Promise<Credentials> {
  if (!credentials.refreshToken) return credentials
  const { data } = await axios.post<DropboxSignTokenResponse>(
    OAUTH_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: credentials.refreshToken,
      secret: clientSecret,
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' } },
  )
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? credentials.refreshToken,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    extra: credentials.extra ?? {},
  }
}
