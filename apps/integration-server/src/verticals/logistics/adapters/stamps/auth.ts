import axios from 'axios'
import type { Credentials } from '../../adapter/interface'
import { SERA_AUTH_BASE, SERA_DASHBOARD_URL } from './constants'

/**
 * Stamps.com SERA uses OAuth2 Authorization Code flow.
 *
 * clientId and clientSecret are expected in `credentials.extra`.
 */

/**
 * Build the OAuth2 authorization URL that the merchant visits to grant access.
 */
export function buildAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string,
  scopes: string[] = [],
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
  })
  if (scopes.length > 0) {
    params.set('scope', scopes.join(' '))
  }
  return `${SERA_AUTH_BASE}/oauth/authorize?${params.toString()}`
}

/**
 * Exchange an authorization code for access + refresh tokens.
 */
export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<Credentials> {
  const { data } = await axios.post<{
    access_token: string
    refresh_token?: string
    expires_in?: number
    scope?: string
    token_type: string
  }>(`${SERA_AUTH_BASE}/oauth/token`, {
    grant_type: 'authorization_code',
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
  })

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000)
      : undefined,
    scope: data.scope,
    extra: { clientId, clientSecret },
  }
}

/**
 * Refresh an expired access token using the refresh token.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  if (!credentials.refreshToken) {
    // No refresh token available — return as-is (caller should re-auth).
    return credentials
  }

  const clientId = credentials.extra?.clientId as string | undefined
  const clientSecret = credentials.extra?.clientSecret as string | undefined
  if (!clientId || !clientSecret) {
    throw new Error('stamps: clientId and clientSecret are required in credentials.extra to refresh')
  }

  const { data } = await axios.post<{
    access_token: string
    refresh_token?: string
    expires_in?: number
    scope?: string
    token_type: string
  }>(`${SERA_AUTH_BASE}/oauth/token`, {
    grant_type: 'refresh_token',
    refresh_token: credentials.refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  })

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? credentials.refreshToken,
    expiresAt: data.expires_in
      ? new Date(Date.now() + data.expires_in * 1000)
      : undefined,
    scope: data.scope ?? credentials.scope,
    extra: credentials.extra,
  }
}

/**
 * Build the Authorization header value for SERA requests.
 */
export function authHeader(accessToken: string): string {
  return `Bearer ${accessToken}`
}

/**
 * Returns the Stamps.com developer dashboard URL (for non-OAuth key management).
 */
export function getDashboardUrl(): string {
  return SERA_DASHBOARD_URL
}
