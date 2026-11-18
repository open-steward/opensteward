import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { OAUTH_AUTHORIZE_URL, OAUTH_TOKEN_URL } from './constants'

/**
 * Authorization code grant, per the "Authorization code grant" article
 * (https://stoplight.io/api/v1/projects/cHJqOjQxMTI4/nodes/a7847a3b741c6):
 * the authorization request carries client_id, redirect_uri, scope,
 * response_type=code, response_mode=query and state ("At the time of writing
 * Autenti supports `response_mode` value `query` only").
 */
export function buildAuthUrl(
  clientId: string,
  redirectUri: string,
  scopes: string[],
  state: string,
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes.join(' '),
    response_type: 'code',
    response_mode: 'query',
    state,
  })
  return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  token_type: string
  expires_in: number
  scope?: string
}

/**
 * The token endpoint takes a JSON body ("Content-Type: application/json"):
 * client_id, client_secret, grant_type, code and redirect_uri for the code
 * exchange; client_id, client_secret, grant_type=refresh_token and
 * refresh_token for a refresh ("Refreshing tokens", node 3b0065697f838).
 */
async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const { data } = await axios.post<TokenResponse>(OAUTH_TOKEN_URL, body, {
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
  })
  return data
}

export async function exchangeCode(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const data = await tokenRequest({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  })
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    scope: data.scope,
    extra: {},
  }
}

/**
 * "A specific refresh token can be used only once. After refreshing the
 * token, you must use the new `refresh_token` returned in the response."
 */
export async function refreshCredentials(
  credentials: Credentials,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  if (!credentials.refreshToken) return credentials
  const data = await tokenRequest({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: credentials.refreshToken,
  })
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? credentials.refreshToken,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    scope: data.scope ?? credentials.scope,
    extra: credentials.extra ?? {},
  }
}
