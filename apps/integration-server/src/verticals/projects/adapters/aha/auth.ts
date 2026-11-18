/**
 * Aha! OAuth2 (authorization-code grant).
 *
 * Authorize:  GET  https://secure.aha.io/oauth/authorize
 * Token:      POST https://secure.aha.io/oauth/token
 *
 * The token response is `{ access_token, token_type: "bearer" }`. Aha! does
 * not document refresh tokens or token expiry — access tokens are treated as
 * long-lived, so `refreshCredentials` is a no-op pass-through.
 *
 * Access tokens carry no scopes; the `scope` parameter is omitted from the
 * authorize URL.
 *
 * Docs: https://www.aha.io/api/oauth2
 */
import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { OAUTH_AUTHORIZE_URL, OAUTH_TOKEN_URL, DEFAULT_API_BASE_URL } from './constants'

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
  // Aha! tokens are unscoped; only send `scope` if a caller explicitly supplies one.
  if (scopes.length > 0) params.set('scope', scopes.join(' '))
  return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`
}

interface TokenResponse {
  access_token: string
  token_type?: string
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
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' } },
  )
  return {
    accessToken: data.access_token,
    // No refresh token and no documented expiry — token is long-lived.
    extra: { apiBaseUrl: DEFAULT_API_BASE_URL },
  }
}

/**
 * Aha! does not issue refresh tokens. Credentials are returned unchanged so
 * the refresh path is a safe no-op.
 */
export async function refreshCredentials(
  credentials: Credentials,
  _clientId: string,
  _clientSecret: string,
): Promise<Credentials> {
  return credentials
}
