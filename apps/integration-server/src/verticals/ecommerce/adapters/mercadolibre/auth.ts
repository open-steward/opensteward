/**
 * Mercado Libre OAuth2 auth helpers — authorization-code + refresh-token flow.
 *
 * Mercado Libre uses standard OAuth2 authorization code grant. Sellers consent
 * via Mercado Libre's OAuth2 authorize endpoint; we exchange the code for
 * access + refresh tokens. Access tokens expire in 6 hours.
 *
 * Credentials layout:
 *   - `accessToken`        ML user access token (6h TTL)
 *   - `refreshToken`       ML refresh token
 *   - `expiresAt`          Date the access token expires
 *   - `extra.clientId`     ML app id (APP_ID)
 *   - `extra.clientSecret` ML client secret
 *   - `extra.userId`       ML seller user id (needed for seller-scoped queries)
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { OAUTH_AUTHORIZE_URL, OAUTH_TOKEN_URL, TOKEN_BUFFER_MS } from './constants'

/**
 * Build the Mercado Libre OAuth2 consent URL. The `state` param is passed
 * through for CSRF protection.
 */
export function buildAuthUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    state,
  })
  return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`
}

interface MeliTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  scope: string
  user_id: number
  refresh_token: string
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
  const res = await axios.post<MeliTokenResponse>(
    OAUTH_TOKEN_URL,
    {
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    },
    {
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      timeout: 30_000,
    },
  )
  const { access_token, refresh_token, expires_in, user_id } = res.data
  if (!access_token) {
    throw new Error('Mercado Libre token endpoint returned an empty access_token')
  }
  const ttlMs = Math.max(0, expires_in * 1000 - TOKEN_BUFFER_MS)
  return {
    accessToken: access_token,
    refreshToken: refresh_token,
    expiresAt: new Date(Date.now() + ttlMs),
    extra: { clientId, clientSecret, userId: String(user_id) },
  }
}

/**
 * Refresh Mercado Libre credentials using the stored refresh token.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const clientId = credentials.extra?.['clientId'] as string | undefined
  const clientSecret = credentials.extra?.['clientSecret'] as string | undefined
  const refreshToken = credentials.refreshToken
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Mercado Libre refreshCredentials requires refreshToken plus clientId and clientSecret ' +
        'in credentials.extra — one or more were missing. Re-create the connection.',
    )
  }
  const res = await axios.post<MeliTokenResponse>(
    OAUTH_TOKEN_URL,
    {
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    },
    {
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      timeout: 30_000,
    },
  )
  const { access_token, refresh_token: newRefreshToken, expires_in, user_id } = res.data
  if (!access_token) {
    throw new Error('Mercado Libre token endpoint returned an empty access_token')
  }
  const ttlMs = Math.max(0, expires_in * 1000 - TOKEN_BUFFER_MS)
  return {
    ...credentials,
    accessToken: access_token,
    refreshToken: newRefreshToken ?? refreshToken, // ML rotates refresh tokens
    expiresAt: new Date(Date.now() + ttlMs),
    extra: {
      ...credentials.extra,
      userId: user_id ? String(user_id) : (credentials.extra?.['userId'] as string),
    },
  }
}
