/**
 * Wise Platform OAuth2 helpers.
 *
 * Wise supports authorization-code flow for user-delegated access.
 * Tokens are JWT-formatted Bearer tokens.
 *
 * Token exchange (https://docs.wise.com/api-reference/oauth-token): POST
 * /oauth/token, form-encoded, secured by `BasicAuth` — "Basic Authentication
 * using your Client ID and Client Secret as the username and password." The
 * documented `authorization-code-grant` body is grant_type, client_id, code,
 * redirect_uri; the `refresh-token-grant` body is grant_type, refresh_token.
 * The client secret travels only in the Basic header.
 *
 * Docs: https://docs.wise.com/guides/developer/auth-and-security/oauth-2-setup
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

interface WiseTokenResponse {
  access_token: string
  refresh_token?: string
  token_type: string
  expires_in?: number
  scope?: string
}

function tokenHeaders(clientId: string, clientSecret: string): Record<string, string> {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  return {
    Authorization: `Basic ${basic}`,
    'Content-Type': 'application/x-www-form-urlencoded',
    Accept: 'application/json',
  }
}

export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<Credentials> {
  const { data } = await axios.post<WiseTokenResponse>(
    OAUTH_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      code,
      redirect_uri: redirectUri,
    }).toString(),
    { headers: tokenHeaders(clientId, clientSecret) },
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
  const { data } = await axios.post<WiseTokenResponse>(
    OAUTH_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: credentials.refreshToken,
    }).toString(),
    { headers: tokenHeaders(clientId, clientSecret) },
  )
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? credentials.refreshToken,
    scope: data.scope ?? credentials.scope,
    extra: credentials.extra,
  }
}
