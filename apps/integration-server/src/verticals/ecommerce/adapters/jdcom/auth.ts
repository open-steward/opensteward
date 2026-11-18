/**
 * JD.com Open Platform auth helpers — OAuth2 + HMAC-MD5 request signing.
 *
 * JD.com uses standard OAuth2 authorization-code flow for seller auth.
 * All API requests are signed using HMAC-MD5 of sorted parameter string.
 *
 * Auth flow:
 *   1. Redirect seller to JD OAuth page with app_key + redirect_uri.
 *   2. JD redirects back with `code`.
 *   3. Exchange `code` for `{access_token, refresh_token, expires_in}`.
 *   4. Every API call is signed: sort params, concatenate, HMAC-MD5.
 *
 * Credentials layout:
 *   - `accessToken`           JD access token
 *   - `refreshToken`          JD refresh token
 *   - `expiresAt`             Access token expiry
 *   - `extra.appKey`          App key (client_id)
 *   - `extra.appSecret`       App secret (client_secret)
 *
 * Docs: https://jos.jd.com/
 */

import crypto from 'crypto'
import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { AUTH_URL, TOKEN_URL, TOKEN_BUFFER_MS } from './constants'

/**
 * Compute the HMAC-MD5 signature for a JD.com API request.
 *
 * Algorithm:
 *   1. Sort all params alphabetically by key
 *   2. Concatenate: appSecret + key1value1 + key2value2 + ... + appSecret
 *   3. MD5 hash → uppercase hex
 */
export function computeSignature(
  params: Record<string, string>,
  appSecret: string,
): string {
  const sorted = Object.keys(params).sort()
  let concatenated = appSecret
  for (const key of sorted) {
    concatenated += key + params[key]
  }
  concatenated += appSecret
  return crypto
    .createHash('md5')
    .update(concatenated)
    .digest('hex')
    .toUpperCase()
}

/**
 * Build the JD.com OAuth authorization URL.
 */
export function buildAuthUrl(
  appKey: string,
  redirectUri: string,
  state?: string,
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: appKey,
    redirect_uri: redirectUri,
    state: state ?? '',
  })
  return `${AUTH_URL}?${params.toString()}`
}

interface JdTokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  uid?: string
  user_nick?: string
  code?: string
  [key: string]: unknown
}

/**
 * Exchange an authorization code for tokens.
 */
export async function exchangeCode(
  code: string,
  appKey: string,
  appSecret: string,
  redirectUri: string,
): Promise<Credentials> {
  const res = await axios.post<JdTokenResponse>(
    TOKEN_URL,
    new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: appKey,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      code,
    }).toString(),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 30_000,
    },
  )

  const data = res.data
  if (!data.access_token) {
    throw new Error(`JD.com token exchange failed: ${data.code ?? 'no access_token'}`)
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
 * Refresh an expired access token.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const appKey = credentials.extra?.['appKey'] as string | undefined
  const appSecret = credentials.extra?.['appSecret'] as string | undefined
  const refreshToken = credentials.refreshToken

  if (!appKey || !appSecret || !refreshToken) {
    throw new Error(
      'JD.com refreshCredentials requires refreshToken plus appKey and appSecret ' +
        'in credentials.extra — one or more were missing.',
    )
  }

  const res = await axios.post<JdTokenResponse>(
    TOKEN_URL,
    new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: appKey,
      client_secret: appSecret,
      refresh_token: refreshToken,
    }).toString(),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 30_000,
    },
  )

  const data = res.data
  if (!data.access_token) {
    throw new Error(`JD.com token refresh failed: ${data.code ?? 'no access_token'}`)
  }

  const ttlMs = Math.max(0, data.expires_in * 1000 - TOKEN_BUFFER_MS)
  return {
    ...credentials,
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: new Date(Date.now() + ttlMs),
  }
}
