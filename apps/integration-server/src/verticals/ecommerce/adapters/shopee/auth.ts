/**
 * Shopee auth helpers — HMAC-SHA256 request signing + token management.
 *
 * Shopee's auth model is unique in this project:
 *
 *   1. Sellers authorise via a Shopee-hosted consent page. Shopee redirects
 *      back with a `code` and `shop_id`.
 *   2. Exchange `code` for `{access_token, refresh_token, expire_in}` via
 *      `POST /api/v2/auth/token/get`.
 *   3. Tokens expire in ~4 hours. Refresh via
 *      `POST /api/v2/auth/access_token/get`.
 *   4. EVERY API request is signed with HMAC-SHA256: the signature is
 *      computed from `partner_id + api_path + timestamp + access_token + shop_id`
 *      using `partner_key` as the HMAC secret.
 *
 * Credentials layout:
 *
 *   - `accessToken`           Shopee access token (~4h TTL)
 *   - `refreshToken`          Shopee refresh token
 *   - `expiresAt`             Access token expiry
 *   - `extra.partnerId`       Partner (app) ID
 *   - `extra.partnerKey`      Partner secret key (used for HMAC signing)
 *   - `extra.shopId`          Target shop ID
 *
 * Docs: https://open.shopee.com/documents/v2/v2.auth.overview
 */

import { createHmac } from 'node:crypto'
import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import {
  BASE_URL,
  API_PREFIX,
  AUTH_TOKEN_PATH,
  AUTH_REFRESH_PATH,
  TOKEN_BUFFER_MS,
} from './constants'

/**
 * Compute the HMAC-SHA256 signature that Shopee requires on every request.
 *
 * Formula: HMAC-SHA256(partner_key, partner_id + api_path + timestamp + access_token + shop_id)
 *
 * All components are concatenated as strings with no separator.
 */
export function computeSignature(
  partnerKey: string,
  partnerId: number,
  apiPath: string,
  timestamp: number,
  accessToken: string,
  shopId: number,
): string {
  const baseString = `${partnerId}${apiPath}${timestamp}${accessToken}${shopId}`
  return createHmac('sha256', partnerKey).update(baseString).digest('hex')
}

/**
 * Compute a signature for auth endpoints (no access_token or shop_id).
 */
export function computeAuthSignature(
  partnerKey: string,
  partnerId: number,
  apiPath: string,
  timestamp: number,
): string {
  const baseString = `${partnerId}${apiPath}${timestamp}`
  return createHmac('sha256', partnerKey).update(baseString).digest('hex')
}

/**
 * Build the Shopee OAuth authorization URL. Sellers visit this to grant
 * access. Shopee redirects back to `redirectUri` with `code` and `shop_id`.
 */
export function buildAuthUrl(
  partnerId: number,
  redirectUri: string,
  partnerKey: string,
): string {
  const path = `${API_PREFIX}/shop/auth_partner`
  const timestamp = Math.floor(Date.now() / 1000)
  const sign = computeAuthSignature(partnerKey, partnerId, path, timestamp)
  const params = new URLSearchParams({
    partner_id: String(partnerId),
    redirect: redirectUri,
    timestamp: String(timestamp),
    sign,
  })
  return `${BASE_URL}${path}?${params.toString()}`
}

interface ShopeeTokenResponse {
  access_token: string
  refresh_token: string
  expire_in: number
  error: string
  message: string
  request_id: string
  shop_id?: number
  partner_id?: number
}

/**
 * Exchange an authorization code for tokens.
 */
export async function exchangeCode(
  code: string,
  partnerId: number,
  partnerKey: string,
  shopId: number,
): Promise<Credentials> {
  const path = `${API_PREFIX}${AUTH_TOKEN_PATH}`
  const timestamp = Math.floor(Date.now() / 1000)
  const sign = computeAuthSignature(partnerKey, partnerId, path, timestamp)

  const res = await axios.post<ShopeeTokenResponse>(
    `${BASE_URL}${path}`,
    {
      code,
      partner_id: partnerId,
      shop_id: shopId,
    },
    {
      params: {
        partner_id: partnerId,
        timestamp,
        sign,
      },
      headers: { 'Content-Type': 'application/json' },
      timeout: 30_000,
    },
  )

  const { access_token, refresh_token, expire_in, error } = res.data
  if (error && error !== '') {
    throw new Error(`Shopee token exchange failed: ${error} — ${res.data.message}`)
  }

  const ttlMs = Math.max(0, expire_in * 1000 - TOKEN_BUFFER_MS)
  return {
    accessToken: access_token,
    refreshToken: refresh_token,
    expiresAt: new Date(Date.now() + ttlMs),
    extra: {
      partnerId,
      partnerKey,
      shopId,
    },
  }
}

/**
 * Refresh an expired access token.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const partnerId = credentials.extra?.['partnerId'] as number | undefined
  const partnerKey = credentials.extra?.['partnerKey'] as string | undefined
  const shopId = credentials.extra?.['shopId'] as number | undefined
  const refreshToken = credentials.refreshToken

  if (!partnerId || !partnerKey || !shopId || !refreshToken) {
    throw new Error(
      'Shopee refreshCredentials requires refreshToken plus partnerId, partnerKey, and shopId ' +
        'in credentials.extra — one or more were missing.',
    )
  }

  const path = `${API_PREFIX}${AUTH_REFRESH_PATH}`
  const timestamp = Math.floor(Date.now() / 1000)
  const sign = computeAuthSignature(partnerKey, partnerId, path, timestamp)

  const res = await axios.post<ShopeeTokenResponse>(
    `${BASE_URL}${path}`,
    {
      refresh_token: refreshToken,
      partner_id: partnerId,
      shop_id: shopId,
    },
    {
      params: {
        partner_id: partnerId,
        timestamp,
        sign,
      },
      headers: { 'Content-Type': 'application/json' },
      timeout: 30_000,
    },
  )

  const { access_token, refresh_token, expire_in, error } = res.data
  if (error && error !== '') {
    throw new Error(`Shopee token refresh failed: ${error} — ${res.data.message}`)
  }

  const ttlMs = Math.max(0, expire_in * 1000 - TOKEN_BUFFER_MS)
  return {
    ...credentials,
    accessToken: access_token,
    refreshToken: refresh_token,
    expiresAt: new Date(Date.now() + ttlMs),
  }
}
