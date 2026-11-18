/**
 * Jumia Vendor API auth helpers — OAuth2 client-credentials / authorization-code flow.
 *
 * Jumia uses OAuth2 with client credentials (app key + app secret). Access tokens
 * expire in ~1 hour. Refresh tokens are valid for 30 days.
 *
 * Credentials layout:
 *
 *  - `accessToken`         Jumia access token (~1 hour TTL)
 *  - `refreshToken`        Jumia refresh token (30 days)
 *  - `expiresAt`           Date the access token expires
 *  - `extra.clientId`      Jumia app/client ID
 *  - `extra.clientSecret`  Jumia app/client secret
 *  - `extra.country`       Country code (ng, ke, eg, etc.)
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { AUTH_URL_BASE, TOKEN_ENDPOINT, TOKEN_BUFFER_MS } from './constants'

/**
 * Build the Jumia OAuth authorization URL.
 */
export function buildAuthUrl(
  clientId: string,
  redirectUri: string,
  state?: string,
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
  })
  if (state) params.set('state', state)
  return `${AUTH_URL_BASE}?${params.toString()}`
}

interface JumiaTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  token_type: string
  [key: string]: unknown
}

/**
 * Exchange an authorization code for access and refresh tokens.
 */
export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const res = await axios.post<JumiaTokenResponse>(
    TOKEN_ENDPOINT,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 30_000,
    },
  )

  const data = res.data
  if (!data.access_token) {
    throw new Error('Jumia token endpoint returned an empty access_token')
  }

  const ttlMs = Math.max(0, data.expires_in * 1000 - TOKEN_BUFFER_MS)
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + ttlMs),
    extra: {
      clientId,
      clientSecret,
      tokenResponse: data,
    },
  }
}

/**
 * Refresh credentials using the stored refresh token.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const clientId = credentials.extra?.['clientId'] as string | undefined
  const clientSecret = credentials.extra?.['clientSecret'] as string | undefined
  const refreshToken = credentials.refreshToken
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Jumia refreshCredentials requires refreshToken plus clientId and clientSecret ' +
        'in credentials.extra — one or more were missing. Re-create the connection.',
    )
  }

  const res = await axios.post<JumiaTokenResponse>(
    TOKEN_ENDPOINT,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 30_000,
    },
  )

  const data = res.data
  if (!data.access_token) {
    throw new Error('Jumia token refresh returned an empty access_token')
  }

  const ttlMs = Math.max(0, data.expires_in * 1000 - TOKEN_BUFFER_MS)
  return {
    ...credentials,
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: new Date(Date.now() + ttlMs),
  }
}
