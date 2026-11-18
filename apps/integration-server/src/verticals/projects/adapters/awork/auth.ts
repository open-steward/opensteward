/**
 * awork OAuth 2.0 (authorization-code) flow.
 *
 * Confidential clients authenticate at the token endpoint with HTTP Basic
 * auth (`Authorization: Basic base64(client_id:client_secret)`) per
 * RFC 6749 § 2.3.1. Access tokens are sent as `Authorization: Bearer`.
 * `offline_access` scope is required to receive a refresh token.
 *
 * Docs: https://developers.awork.com/authentication
 */
import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { basicAuth, parseTokenResponse } from '@opensteward/shared'
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
    scope: scopes.join(' '),
    state,
  })
  return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`
}

export async function exchangeCode(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const { data } = await axios.post<Record<string, unknown>>(
    OAUTH_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      client_id: clientId,
    }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicAuth(clientId, clientSecret)}`,
      },
    },
  )
  return parseTokenResponse(data)
}

export async function refreshCredentials(
  credentials: Credentials,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  if (!credentials.refreshToken) return credentials
  const { data } = await axios.post<Record<string, unknown>>(
    OAUTH_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: credentials.refreshToken,
      client_id: clientId,
    }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicAuth(clientId, clientSecret)}`,
      },
    },
  )
  const next = parseTokenResponse(data)
  return {
    ...next,
    refreshToken: next.refreshToken ?? credentials.refreshToken,
    scope: next.scope ?? credentials.scope,
    extra: credentials.extra ?? {},
  }
}
