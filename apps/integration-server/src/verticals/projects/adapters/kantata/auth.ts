/**
 * Kantata OX (formerly Mavenlink) OAuth2 — authorization-code grant.
 *
 * Kantata OX access tokens DO NOT expire and there is no refresh-token
 * flow: the token must be treated like a long-lived credential. The token
 * exchange therefore returns no `expires_in` / `refresh_token`, and
 * `refreshCredentials` is a no-op.
 *
 * Docs: https://developer.kantata.com/ (Authentication / Response Format)
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
  // Kantata OX does not use granular OAuth scopes; only include the param
  // when an operator explicitly supplies one.
  if (scopes.length > 0) params.set('scope', scopes.join(' '))
  return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`
}

interface TokenResponse {
  access_token: string
  token_type: string
  scope?: string
}

export async function exchangeCode(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const { data } = await axios.post<TokenResponse>(
    OAUTH_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  )
  return {
    accessToken: data.access_token,
    scope: data.scope,
    extra: {},
  }
}

/**
 * Kantata OX tokens never expire and cannot be refreshed — return the
 * existing credentials unchanged.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  return credentials
}
