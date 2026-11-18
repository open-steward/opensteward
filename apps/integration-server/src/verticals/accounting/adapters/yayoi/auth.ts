/**
 * Misoca (Yayoi) OAuth2 authentication helpers.
 *
 * Misoca uses standard OAuth2 authorization-code flow.
 * Authorization: https://app.misoca.jp/oauth2/authorize
 * Token:         https://app.misoca.jp/oauth2/token
 *
 * Token lifetime: ~24 h (expires_in: 86400). A refresh_token is issued.
 * Auth header:    Authorization: Bearer {access_token}
 *
 * Docs: https://doc.misoca.jp/
 */

import axios from 'axios'
import { MISOCA_AUTH_URL, MISOCA_TOKEN_URL } from './constants'
import type { Credentials } from '../../adapter/interface'
import { basicAuth, parseTokenResponse } from '@opensteward/shared'

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
  return `${MISOCA_AUTH_URL}?${params.toString()}`
}

export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<Credentials> {
  const { data } = await axios.post<Record<string, unknown>>(
    MISOCA_TOKEN_URL,
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
    MISOCA_TOKEN_URL,
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
