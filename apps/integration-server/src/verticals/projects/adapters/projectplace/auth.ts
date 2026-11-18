/**
 * Projectplace OAuth 2.0 — Authorization Code Flow.
 *
 * Authorize:  GET  https://api.projectplace.com/oauth2/authorize
 * Token:      POST https://api.projectplace.com/oauth2/access_token
 *
 * Token response shape (note: Projectplace uses `expires` not `expires_in`):
 *   { token_type, access_token, expires: <seconds>, refresh_token }
 *
 * Access tokens are valid ~30 days; refresh tokens ~120 days.
 * Bearer token auth: `Authorization: Bearer {access_token}`.
 * Projectplace OAuth2 does not declare scopes.
 *
 * Docs: https://service.projectplace.com/apidocs/oauth2.html
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

/**
 * Projectplace token response. The field is `expires` (seconds from now),
 * NOT `expires_in`.
 */
interface TokenResponse {
  access_token: string
  refresh_token?: string
  token_type: string
  /** seconds until expiry */
  expires?: number
  /** some endpoints may return expires_in as a fallback */
  expires_in?: number
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
  const ttl = data.expires ?? data.expires_in ?? 86400
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + ttl * 1000),
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
  const { data } = await axios.post<TokenResponse>(
    OAUTH_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: credentials.refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  )
  const ttl = data.expires ?? data.expires_in ?? 86400
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? credentials.refreshToken,
    expiresAt: new Date(Date.now() + ttl * 1000),
    scope: data.scope ?? credentials.scope,
    extra: credentials.extra ?? {},
  }
}
