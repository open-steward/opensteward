/**
 * Tmall / Taobao Open Platform (TOP) auth helpers.
 *
 * TOP uses a proprietary MD5 signing algorithm — NOT standard OAuth2 HMAC.
 *
 * Signing algorithm:
 *   1. Collect all request params (including app_key, session, timestamp, method)
 *   2. Sort param keys alphabetically
 *   3. Concatenate: appSecret + key1value1 + key2value2 + ... + appSecret
 *   4. sign = MD5(concatenated_string).toUpperCase()
 *
 * Credentials layout:
 *   - `accessToken`        TOP session_key (OAuth2 access token, ~7 day TTL)
 *   - `refreshToken`       TOP refresh token (~30 day TTL)
 *   - `expiresAt`          When the access token expires
 *   - `extra.appKey`       TOP application key
 *   - `extra.appSecret`    TOP application secret
 *
 * Authorization URL: https://oauth.taobao.com/authorize
 * Token endpoint:    https://oauth.taobao.com/token
 */

import crypto from 'crypto'
import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import {
  TOP_ENDPOINT,
  API_VERSION,
  SIGN_METHOD,
  RESPONSE_FORMAT,
  TOKEN_BUFFER_MS,
} from './constants'

/** TOP OAuth2 authorization URL base. */
export const AUTH_URL_BASE = 'https://oauth.taobao.com/authorize'

/** TOP OAuth2 token endpoint. */
export const TOKEN_ENDPOINT = 'https://oauth.taobao.com/token'

// ── Signing ───────────────────────────────────────────────────────────────────

/**
 * Compute a TOP MD5 signature.
 *
 * All param values are coerced to strings before joining. The appSecret
 * is prepended AND appended (Alibaba's proprietary wrapping).
 *
 * @param params     All request parameters (excluding `sign` itself)
 * @param appSecret  Application secret used as the MD5 salt/wrapper
 * @returns          Uppercase hex MD5 digest
 */
export function buildSign(
  params: Record<string, string>,
  appSecret: string,
): string {
  const sortedKeys = Object.keys(params).sort()
  let raw = appSecret
  for (const key of sortedKeys) {
    raw += key + params[key]
  }
  raw += appSecret
  return crypto.createHash('md5').update(raw, 'utf8').digest('hex').toUpperCase()
}

// ── Request assembly ──────────────────────────────────────────────────────────

/**
 * Compute the TOP timestamp string in UTC+8, formatted as "YYYY-MM-DD HH:mm:ss".
 * TOP requires this exact format in the China Standard Time zone.
 */
export function topTimestamp(): string {
  const now = new Date()
  // UTC+8 offset in ms
  const cst = new Date(now.getTime() + 8 * 60 * 60 * 1000)
  const pad = (n: number): string => n.toString().padStart(2, '0')
  const date = `${cst.getUTCFullYear()}-${pad(cst.getUTCMonth() + 1)}-${pad(cst.getUTCDate())}`
  const time = `${pad(cst.getUTCHours())}:${pad(cst.getUTCMinutes())}:${pad(cst.getUTCSeconds())}`
  return `${date} ${time}`
}

/**
 * Assemble the full set of TOP request params including system params and
 * computed signature. Suitable for direct use as URLSearchParams / form body.
 *
 * @param method      TOP API method name (e.g. `taobao.trades.sold.get`)
 * @param appKey      Application key
 * @param appSecret   Application secret
 * @param accessToken Session key (access token)
 * @param extra       Method-specific params (all values coerced to strings)
 * @returns           Complete params object ready to POST to TOP_ENDPOINT
 */
export function buildRequestParams(
  method: string,
  appKey: string,
  appSecret: string,
  accessToken: string,
  extra: Record<string, string | number | boolean | undefined> = {},
): Record<string, string> {
  const base: Record<string, string> = {
    method,
    app_key: appKey,
    session: accessToken,
    timestamp: topTimestamp(),
    format: RESPONSE_FORMAT,
    v: API_VERSION,
    sign_method: SIGN_METHOD,
  }

  // Merge extra params, skipping undefined values
  for (const [k, v] of Object.entries(extra)) {
    if (v !== undefined) {
      base[k] = String(v)
    }
  }

  const sign = buildSign(base, appSecret)
  return { ...base, sign }
}

// ── OAuth2 helpers ────────────────────────────────────────────────────────────

/**
 * Build the TOP OAuth2 authorization URL. Redirect the user here to begin
 * the authorization flow (authorization-code grant).
 */
export function buildAuthUrl(appKey: string, redirectUri: string, state?: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: appKey,
    redirect_uri: redirectUri,
    view: 'web',
  })
  if (state) params.set('state', state)
  return `${AUTH_URL_BASE}?${params.toString()}`
}

interface TopTokenResponse {
  access_token?: string
  refresh_token?: string
  expires_in?: number
  re_expires_in?: number
  open_uid?: string
  taobao_user_id?: string
  taobao_user_nick?: string
  sub_token_type?: string
  [key: string]: unknown
}

interface TopTokenErrorResponse {
  error?: string
  error_description?: string
  [key: string]: unknown
}

/**
 * Exchange an authorization code for TOP access + refresh tokens.
 */
export async function exchangeCode(
  code: string,
  appKey: string,
  appSecret: string,
  redirectUri: string,
): Promise<Credentials> {
  const res = await axios.post<TopTokenResponse | TopTokenErrorResponse>(
    TOKEN_ENDPOINT,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: appKey,
      client_secret: appSecret,
      redirect_uri: redirectUri,
      view: 'web',
    }).toString(),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 30_000,
    },
  )

  const data = res.data as TopTokenResponse
  if (!data.access_token) {
    const err = res.data as TopTokenErrorResponse
    throw new Error(
      `TOP exchangeCode failed: ${err.error ?? 'unknown'} — ${err.error_description ?? 'no description'}`,
    )
  }

  const expiresIn = data.expires_in ?? 7 * 24 * 3600
  const ttlMs = Math.max(0, expiresIn * 1000 - TOKEN_BUFFER_MS)

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + ttlMs),
    extra: {
      appKey,
      appSecret,
      userId: data.taobao_user_id,
      userNick: data.taobao_user_nick,
      tokenResponse: data,
    },
  }
}

/**
 * Refresh expired credentials using the stored refresh token.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const appKey = credentials.extra?.['appKey'] as string | undefined
  const appSecret = credentials.extra?.['appSecret'] as string | undefined
  const refreshToken = credentials.refreshToken

  if (!appKey || !appSecret || !refreshToken) {
    throw new Error(
      'TOP refreshCredentials requires refreshToken plus appKey and appSecret ' +
        'in credentials.extra — one or more were missing. Re-create the connection.',
    )
  }

  const res = await axios.post<TopTokenResponse | TopTokenErrorResponse>(
    TOKEN_ENDPOINT,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: appKey,
      client_secret: appSecret,
    }).toString(),
    {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      timeout: 30_000,
    },
  )

  const data = res.data as TopTokenResponse
  if (!data.access_token) {
    const err = res.data as TopTokenErrorResponse
    throw new Error(
      `TOP refreshCredentials failed: ${err.error ?? 'unknown'} — ${err.error_description ?? 'no description'}`,
    )
  }

  const expiresIn = data.expires_in ?? 7 * 24 * 3600
  const ttlMs = Math.max(0, expiresIn * 1000 - TOKEN_BUFFER_MS)

  return {
    ...credentials,
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: new Date(Date.now() + ttlMs),
  }
}

// Re-export so client can import directly
export { TOP_ENDPOINT }
