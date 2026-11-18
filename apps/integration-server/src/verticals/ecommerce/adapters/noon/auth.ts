/**
 * Noon auth helpers -- API key and OAuth2 authorization-code flow.
 *
 * Noon supports two authentication modes:
 *   1. **API key** -- a static bearer token issued from the Seller Lab dashboard.
 *      No refresh needed; the token lives until revoked.
 *   2. **OAuth2** -- for partner integrations that act on behalf of sellers.
 *      Standard authorization-code grant with refresh tokens.
 *
 * Credentials layout:
 *
 *  - `accessToken`         Noon access token (API key or OAuth2 bearer)
 *  - `refreshToken`        OAuth2 refresh token (empty for API key auth)
 *  - `expiresAt`           Date the access token expires (far-future for API key)
 *  - `extra.locale`        Locale code (ae, sa, eg)
 *  - `extra.clientId`      OAuth2 client ID (partner integrations only)
 *  - `extra.clientSecret`  OAuth2 client secret (partner integrations only)
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { AUTH_URL_BASE, TOKEN_ENDPOINT, TOKEN_BUFFER_MS } from './constants'

/**
 * Build the Noon OAuth authorization URL.
 */
export function buildAuthUrl(clientId: string, redirectUri: string, state?: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
  })
  if (state) params.set('state', state)
  return `${AUTH_URL_BASE}?${params.toString()}`
}

interface NoonTokenResponse {
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
  redirectUri: string,
): Promise<Credentials> {
  const res = await axios.post<NoonTokenResponse>(
    TOKEN_ENDPOINT,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }).toString(),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 30_000,
    },
  )

  const data = res.data
  if (!data.access_token) {
    throw new Error('Noon token endpoint returned an empty access_token')
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
      'Noon refreshCredentials requires refreshToken plus clientId and clientSecret ' +
        'in credentials.extra -- one or more were missing. Re-create the connection.',
    )
  }

  const res = await axios.post<NoonTokenResponse>(
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
    throw new Error('Noon token refresh returned an empty access_token')
  }

  const ttlMs = Math.max(0, data.expires_in * 1000 - TOKEN_BUFFER_MS)
  return {
    ...credentials,
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: new Date(Date.now() + ttlMs),
  }
}
