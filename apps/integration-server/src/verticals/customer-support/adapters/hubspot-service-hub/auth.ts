/**
 * HubSpot Service Hub OAuth 2.0 Authorization Code flow.
 *
 * Authorize URL:  https://app.hubspot.com/oauth/authorize
 * Token URL:      https://api.hubapi.com/oauth/v1/token
 * Access tokens expire in 30 minutes; use refresh_token to renew.
 */
import axios from 'axios'
import type { Credentials, CredentialField } from '@opensteward/shared'
import {
  OAUTH_AUTHORIZE_URL,
  OAUTH_TOKEN_URL,
  DEFAULT_SCOPES,
} from './constants'

export function credentialFields(): CredentialField[] {
  return []
}

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
  })
  return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`
}

interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
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
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  )
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    extra: {
      expiresIn: String(data.expires_in ?? 1800),
    },
  }
}

export async function refreshCredentials(credentials: Credentials, clientId: string, clientSecret: string): Promise<Credentials> {
  if (!credentials.refreshToken) return credentials
  const { data } = await axios.post<TokenResponse>(
    OAUTH_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: credentials.refreshToken,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  )
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? credentials.refreshToken,
    extra: {
      ...credentials.extra,
      expiresIn: String(data.expires_in ?? 1800),
    },
  }
}

export { DEFAULT_SCOPES }
