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
    scope: scopes.join(' '),
    state,
    response_type: 'code',
  })
  return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`
}

interface TokenResponse {
  access_token: string
  token_type?: string
  expires_in?: number
  scope?: string
}

/**
 * WorkBoard uses `client_hash` (not `client_secret`) for the token exchange.
 * The `client_hash` is the OAuth app secret shown in the WorkBoard developer
 * portal after app registration.
 */
export async function exchangeCode(
  code: string,
  redirectUri: string,
  clientId: string,
  clientHash: string,
): Promise<Credentials> {
  const { data } = await axios.post<TokenResponse>(
    OAUTH_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_hash: clientHash,
      redirect_uri: redirectUri,
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  )
  // WorkBoard access tokens are valid for one year; no refresh token issued.
  const expiresIn = typeof data.expires_in === 'number' ? data.expires_in : 365 * 24 * 3600
  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + expiresIn * 1000),
    scope: data.scope,
    extra: {},
  }
}

/**
 * WorkBoard does not issue refresh tokens (access tokens are long-lived).
 * Return the existing credentials unchanged.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
