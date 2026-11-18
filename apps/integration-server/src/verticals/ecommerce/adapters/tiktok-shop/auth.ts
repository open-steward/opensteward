/**
 * TikTok Shop auth helpers — HMAC-SHA256 request signing + token management.
 *
 * TikTok Shop's auth model uses HMAC-SHA256 request signing similar to Shopee:
 *
 *   1. Sellers authorise via a TikTok-hosted consent page. TikTok redirects
 *      back with an `auth_code`.
 *   2. Exchange `auth_code` for `{access_token, refresh_token, access_token_expire_in}`.
 *   3. `access_token_expire_in` is the expiry instant (default validity 7
 *      days). Refresh via the refresh endpoint on auth.tiktok-shops.com.
 *   4. EVERY API request is signed with HMAC-SHA256: the signature is
 *      computed from the path, query params, and body using the app secret.
 *
 * Credentials layout:
 *
 *   - `accessToken`           TikTok Shop access token (~24h TTL)
 *   - `refreshToken`          TikTok Shop refresh token
 *   - `expiresAt`             Access token expiry
 *   - `extra.appKey`          App key (client id)
 *   - `extra.appSecret`       App secret (used for HMAC signing)
 *   - `extra.shopCipher`      Encrypted shop ID for API calls
 *   - `extra.shopId`          Human-readable shop ID
 *
 * Docs: https://partner.tiktokshop.com/
 */

import { createHmac } from 'node:crypto'
import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { AUTH_BASE_URL, AUTH_TOKEN_PATH, AUTH_REFRESH_PATH, TOKEN_BUFFER_MS } from './constants'

/**
 * Compute the HMAC-SHA256 signature that TikTok Shop requires on every request.
 *
 * Formula:
 *   1. Concatenate: path + sorted query params (key=value pairs, excluding
 *      sign, access_token) + body
 *   2. Wrap with app_secret: app_secret + concatenated_string + app_secret
 *   3. HMAC-SHA256(app_secret, wrapped_string)
 *
 * All components are concatenated as strings with no separator.
 */
export function computeSignature(
  appSecret: string,
  path: string,
  queryParams: Record<string, string>,
  body?: string,
): string {
  // Sort query params by key, exclude 'sign' and 'access_token'
  const sortedKeys = Object.keys(queryParams)
    .filter((k) => k !== 'sign' && k !== 'access_token')
    .sort()

  const paramString = sortedKeys.map((k) => `${k}${queryParams[k]}`).join('')
  const bodyString = body ?? ''
  const baseString = `${appSecret}${path}${paramString}${bodyString}${appSecret}`

  return createHmac('sha256', appSecret).update(baseString).digest('hex')
}

/**
 * Build the TikTok Shop OAuth authorization URL. Sellers visit this to grant
 * access. TikTok redirects back to `redirectUri` with `auth_code`.
 */
export function buildAuthUrl(appKey: string, _redirectUri: string): string {
  const params = new URLSearchParams({
    app_key: appKey,
    state: 'oauth',
  })
  return `https://services.tiktokshop.com/open/authorize?${params.toString()}`
}

/**
 * `access_token_expire_in` is an expiry INSTANT, not a lifetime: "| `data.access_token_expire_in`
 * | Unix timestamp | Access token expiration (default validity: **7 days**). | 1660556783 |"
 * (Authorization overview). Refresh {@link TOKEN_BUFFER_MS} before it.
 */
function expiresAt(expireInstantSecs: number): Date {
  return new Date(expireInstantSecs * 1000 - TOKEN_BUFFER_MS)
}

interface TikTokTokenResponse {
  code: number
  message: string
  data: {
    access_token: string
    refresh_token: string
    access_token_expire_in: number
    refresh_token_expire_in: number
    open_id: string
    seller_name?: string
    seller_base_region?: string
  }
}

/**
 * Exchange an authorization code for tokens.
 */
export async function exchangeCode(
  authCode: string,
  appKey: string,
  appSecret: string,
): Promise<Credentials> {
  const res = await axios.get<TikTokTokenResponse>(`${AUTH_BASE_URL}${AUTH_TOKEN_PATH}`, {
    params: {
      app_key: appKey,
      app_secret: appSecret,
      auth_code: authCode,
      grant_type: 'authorized_code',
    },
    headers: { 'Content-Type': 'application/json' },
    timeout: 30_000,
  })

  const { data } = res.data
  if (!data?.access_token) {
    throw new Error(`TikTok Shop token exchange failed: ${res.data.message}`)
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: expiresAt(data.access_token_expire_in),
    extra: {
      appKey,
      appSecret,
      openId: data.open_id,
      sellerName: data.seller_name,
      sellerBaseRegion: data.seller_base_region,
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
      'TikTok Shop refreshCredentials requires refreshToken plus appKey and appSecret ' +
        'in credentials.extra — one or more were missing.',
    )
  }

  const res = await axios.get<TikTokTokenResponse>(`${AUTH_BASE_URL}${AUTH_REFRESH_PATH}`, {
    params: {
      app_key: appKey,
      app_secret: appSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    },
    headers: { 'Content-Type': 'application/json' },
    timeout: 30_000,
  })

  const { data } = res.data
  if (!data?.access_token) {
    throw new Error(`TikTok Shop token refresh failed: ${res.data.message}`)
  }

  return {
    ...credentials,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: expiresAt(data.access_token_expire_in),
  }
}
