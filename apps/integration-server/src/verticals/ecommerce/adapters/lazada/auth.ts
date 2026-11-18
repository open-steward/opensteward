/**
 * Lazada Open Platform auth helpers — OAuth2 authorization-code flow.
 *
 * Lazada uses a standard OAuth2 authorization-code grant. Access tokens
 * expire in ~7 days; refresh tokens are valid for 30 days. Refresh is
 * performed via `POST https://auth.lazada.com/rest/token/create` with
 * `grant_type=refresh_token`.
 *
 * Credentials layout:
 *
 *  - `accessToken`         Lazada access token (~7 days TTL)
 *  - `refreshToken`        Lazada refresh token (30 days)
 *  - `expiresAt`           Date the access token expires
 *  - `extra.appKey`        Lazada app key
 *  - `extra.appSecret`     Lazada app secret
 *  - `extra.country`       Country code (sg, my, th, ph, vn, id)
 */

import axios from 'axios'
import crypto from 'crypto'
import type { Credentials } from '@opensteward/shared'
import { AUTH_URL_BASE, TOKEN_ENDPOINT, TOKEN_BUFFER_MS } from './constants'

/**
 * Build the Lazada OAuth authorization URL. The caller should redirect the
 * user to this URL to start the authorization flow.
 */
export function buildAuthUrl(appKey: string, redirectUri: string, state?: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    force_auth: 'true',
    redirect_uri: redirectUri,
    client_id: appKey,
  })
  if (state) params.set('state', state)
  return `${AUTH_URL_BASE}?${params.toString()}`
}

interface LazadaTokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  refresh_expires_in: number
  country_user_info?: Array<{ country: string; seller_id: string }>
  account?: string
  [key: string]: unknown
}

/**
 * Sign a request to the Lazada token endpoint.
 *
 * The signature algorithm is the same used for all Lazada API calls:
 * 1. Sort params alphabetically by key
 * 2. Concatenate: api_path + key1value1 + key2value2 + ...
 * 3. HMAC-SHA256 with appSecret
 * 4. Hex-encode uppercase
 */
export function signRequest(
  apiPath: string,
  params: Record<string, string>,
  appSecret: string,
): string {
  const sorted = Object.keys(params).sort()
  let concatenated = apiPath
  for (const key of sorted) {
    concatenated += key + params[key]
  }
  return crypto
    .createHmac('sha256', appSecret)
    .update(concatenated)
    .digest('hex')
    .toUpperCase()
}

/**
 * Exchange an authorization code for access and refresh tokens.
 */
export async function exchangeCode(
  code: string,
  appKey: string,
  appSecret: string,
): Promise<Credentials> {
  const timestamp = Date.now().toString()
  const apiPath = '/auth/token/create'
  const params: Record<string, string> = {
    app_key: appKey,
    timestamp,
    sign_method: 'sha256',
    code,
  }
  const sign = signRequest(apiPath, params, appSecret)

  const res = await axios.get<LazadaTokenResponse>(TOKEN_ENDPOINT, {
    params: {
      ...params,
      sign,
    },
    timeout: 30_000,
  })

  const data = res.data
  if (!data.access_token) {
    throw new Error('Lazada token endpoint returned an empty access_token')
  }

  const ttlMs = Math.max(0, data.expires_in * 1000 - TOKEN_BUFFER_MS)
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + ttlMs),
    extra: {
      appKey,
      appSecret,
      tokenResponse: data,
    },
  }
}

/**
 * Refresh credentials using the stored refresh token.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const appKey = credentials.extra?.['appKey'] as string | undefined
  const appSecret = credentials.extra?.['appSecret'] as string | undefined
  const refreshToken = credentials.refreshToken
  if (!appKey || !appSecret || !refreshToken) {
    throw new Error(
      'Lazada refreshCredentials requires refreshToken plus appKey and appSecret ' +
        'in credentials.extra — one or more were missing. Re-create the connection.',
    )
  }

  const timestamp = Date.now().toString()
  const apiPath = '/auth/token/refresh'
  const params: Record<string, string> = {
    app_key: appKey,
    timestamp,
    sign_method: 'sha256',
    refresh_token: refreshToken,
  }
  const sign = signRequest(apiPath, params, appSecret)

  const res = await axios.get<LazadaTokenResponse>(TOKEN_ENDPOINT, {
    params: {
      ...params,
      sign,
    },
    timeout: 30_000,
  })

  const data = res.data
  if (!data.access_token) {
    throw new Error('Lazada token refresh returned an empty access_token')
  }

  const ttlMs = Math.max(0, data.expires_in * 1000 - TOKEN_BUFFER_MS)
  return {
    ...credentials,
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: new Date(Date.now() + ttlMs),
  }
}
