/**
 * Nifty OAuth 2.0 (authorization-code) flow.
 *
 * The token endpoint authenticates the confidential client with HTTP Basic
 * auth (`Authorization: Basic base64(client_id:client_secret)`); the
 * authorization-code body carries `code` + `redirect_uri`, the refresh body
 * carries `refresh_token`. Access tokens are sent as `Authorization: Bearer`.
 *
 * Docs: https://developers.niftypm.com/group/endpoint-authentication
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
