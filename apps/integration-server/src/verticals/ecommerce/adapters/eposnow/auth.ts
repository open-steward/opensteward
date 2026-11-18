/**
 * Epos Now OAuth2 helpers.
 *
 * Supports two auth modes:
 *  1. OAuth2 (accessToken + refreshToken) — interactive flow via Dashboard.
 *  2. API key (apiKey + apiSecret) — no refresh needed.
 *
 * For OAuth2, exchange an authorization code for tokens via the Token endpoint.
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { TOKEN_URL } from './constants'

interface EposNowTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
}

/**
 * Exchange an authorization code for access + refresh tokens.
 */
export async function exchangeCode(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const { data } = await axios.post<EposNowTokenResponse>(TOKEN_URL, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  })

  const expiresAt = data.expires_in
    ? new Date(Date.now() + data.expires_in * 1000)
    : undefined

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt,
    extra: { clientId, clientSecret },
  }
}

/**
 * Refresh an access token. API-key credentials are returned unchanged.
 */
export async function refreshAccessToken(
  credentials: Credentials,
): Promise<Credentials> {
  // API-key auth — no refresh needed
  if (!credentials.accessToken && credentials.extra?.['apiKey']) {
    return credentials
  }

  // If no expiry or no refresh token, return as-is
  if (!credentials.expiresAt || !credentials.refreshToken) {
    return credentials
  }

  const clientId = credentials.extra?.['clientId'] as string | undefined
  const clientSecret = credentials.extra?.['clientSecret'] as string | undefined

  if (!clientId || !clientSecret) {
    throw new Error('Epos Now refresh requires clientId and clientSecret in credentials.extra')
  }

  const { data } = await axios.post<EposNowTokenResponse>(TOKEN_URL, {
    grant_type: 'refresh_token',
    refresh_token: credentials.refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  })

  const expiresAt = data.expires_in
    ? new Date(Date.now() + data.expires_in * 1000)
    : undefined

  // Spread first: refreshWithRotationGuard persists this object in place of the
  // stored one, so anything not carried over (webhookSecret, tenantId, scope,
  // extra) would be lost from the connection.
  return {
    ...credentials,
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? credentials.refreshToken,
    expiresAt,
  }
}
