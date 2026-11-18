/**
 * Tokopedia auth helpers — OAuth2 with client_credentials + authorization_code.
 *
 * Tokopedia uses a standard OAuth2 flow:
 *
 *   1. Sellers authorise via Tokopedia consent page. Tokopedia redirects
 *      back with a `code`.
 *   2. Exchange `code` for `{access_token, token_type, expires_in}` via
 *      `POST /token` with Basic auth (client_id:client_secret).
 *   3. Tokens expire in ~24 hours. Refresh via the same endpoint with
 *      `grant_type=refresh_token`.
 *   4. API requests use Bearer token in Authorization header.
 *
 * Credentials layout:
 *
 *   - `accessToken`           Tokopedia access token
 *   - `refreshToken`          Tokopedia refresh token
 *   - `expiresAt`             Access token expiry
 *   - `extra.clientId`        App client ID
 *   - `extra.clientSecret`    App client secret
 *   - `extra.fsId`            Fulfillment Service (partner) ID
 *   - `extra.shopId`          Target shop ID
 *
 * Docs: https://developer.tokopedia.com/openapi/guide/#/authentication
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { AUTH_BASE_URL, AUTH_TOKEN_PATH, AUTH_AUTHORIZE_PATH, TOKEN_BUFFER_MS } from './constants'

/**
 * Build the Tokopedia OAuth authorization URL. Sellers visit this to
 * grant access.
 */
export function buildAuthUrl(
  clientId: string,
  redirectUri: string,
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
  })
  return `${AUTH_BASE_URL}${AUTH_AUTHORIZE_PATH}?${params.toString()}`
}

interface TokopediaTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  refresh_token?: string
  error?: string
  error_description?: string
}

/**
 * Build a Basic auth header from client_id:client_secret.
 */
function basicAuth(clientId: string, clientSecret: string): string {
  return `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`
}

/**
 * Exchange an authorization code for tokens.
 */
export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const res = await axios.post<TokopediaTokenResponse>(
    `${AUTH_BASE_URL}${AUTH_TOKEN_PATH}`,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
    }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: basicAuth(clientId, clientSecret),
      },
      timeout: 30_000,
    },
  )

  const { access_token, refresh_token, expires_in, error, error_description } = res.data
  if (error) {
    throw new Error(`Tokopedia token exchange failed: ${error} — ${error_description ?? ''}`)
  }

  const ttlMs = Math.max(0, expires_in * 1000 - TOKEN_BUFFER_MS)
  return {
    accessToken: access_token,
    refreshToken: refresh_token,
    expiresAt: new Date(Date.now() + ttlMs),
    extra: {
      clientId,
      clientSecret,
    },
  }
}

/**
 * Refresh an expired access token.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const clientId = credentials.extra?.['clientId'] as string | undefined
  const clientSecret = credentials.extra?.['clientSecret'] as string | undefined
  const refreshToken = credentials.refreshToken

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Tokopedia refreshCredentials requires refreshToken plus clientId and clientSecret ' +
        'in credentials.extra — one or more were missing.',
    )
  }

  const res = await axios.post<TokopediaTokenResponse>(
    `${AUTH_BASE_URL}${AUTH_TOKEN_PATH}`,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: basicAuth(clientId, clientSecret),
      },
      timeout: 30_000,
    },
  )

  const { access_token, refresh_token, expires_in, error, error_description } = res.data
  if (error) {
    throw new Error(`Tokopedia token refresh failed: ${error} — ${error_description ?? ''}`)
  }

  const ttlMs = Math.max(0, expires_in * 1000 - TOKEN_BUFFER_MS)
  return {
    ...credentials,
    accessToken: access_token,
    refreshToken: refresh_token ?? credentials.refreshToken,
    expiresAt: new Date(Date.now() + ttlMs),
  }
}
