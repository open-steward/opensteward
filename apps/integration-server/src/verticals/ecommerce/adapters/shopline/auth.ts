/**
 * SHOPLINE OAuth2 helpers.
 *
 * SHOPLINE uses a standard authorization-code grant (RFC 6749) with
 * per-store endpoints. Access tokens expire after 10 hours and MUST be
 * refreshed before expiry using the refresh token endpoint.
 *
 * Docs: https://developer.shopline.com/docs/apps/api-instructions-for-use/app-authorization/
 *
 * Authorize URL:
 *   GET https://{handle}.myshopline.com/admin/oauth-web/#/oauth/authorize
 *       ?appKey={appKey}&responseType=code&scope={scope}&redirectUri={redirectUri}
 *
 * Token endpoint:
 *   POST https://{handle}.myshopline.com/admin/oauth/token/create
 *   Headers: appkey, timestamp, sign (HMAC-SHA256 of body+timestamp)
 *   Body: { code }
 *   Response: { code: 200, data: { accessToken, refreshToken, expireTime, scope } }
 *
 * Refresh endpoint:
 *   POST https://{handle}.myshopline.com/admin/oauth/token/refresh
 *   Same header scheme; existing access token in Authorization: Bearer header.
 */

import axios from 'axios'
import { createHmac } from 'node:crypto'
import type { Credentials } from '@opensteward/shared'

function storeHost(handle: string): string {
  return handle.endsWith('.myshopline.com') ? handle : `${handle}.myshopline.com`
}

/**
 * SHOPLINE POST request signature: HMAC-SHA256 of (requestBody + timestamp)
 * using the app secret, returned as a hex string.
 */
function buildSign(appSecret: string, body: string, timestamp: string): string {
  return createHmac('sha256', appSecret).update(body + timestamp).digest('hex')
}

export function buildAuthUrl(
  handle: string,
  appKey: string,
  redirectUri: string,
  scopes: string[],
  _state: string,
): string {
  const params = new URLSearchParams({
    appKey,
    responseType: 'code',
    scope: scopes.join(','),
    redirectUri,
    state: _state,
  })
  // SHOPLINE embeds the authorize page as a hash-route SPA.
  return `https://${storeHost(handle)}/admin/oauth-web/#/oauth/authorize?${params.toString()}`
}

interface ShoplineTokenResponse {
  code: number
  data?: {
    accessToken: string
    refreshToken?: string
    expireTime?: string // ISO-8601: "yyyy-MM-dd'T'HH:mm:ss.SSSXXX"
    scope?: string
  }
  message?: string
}

export async function exchangeCode(
  handle: string,
  code: string,
  appKey: string,
  appSecret: string,
): Promise<Credentials> {
  const host = storeHost(handle)
  const bodyStr = JSON.stringify({ code })
  const timestamp = String(Date.now())
  const sign = buildSign(appSecret, bodyStr, timestamp)

  const { data } = await axios.post<ShoplineTokenResponse>(
    `https://${host}/admin/oauth/token/create`,
    bodyStr,
    {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        appkey: appKey,
        timestamp,
        sign,
      },
    },
  )

  if (data.code !== 200 || !data.data?.accessToken) {
    throw new Error(`SHOPLINE token exchange failed: ${data.message ?? JSON.stringify(data)}`)
  }

  let expiresAt: Date | undefined
  if (data.data.expireTime) {
    const parsed = new Date(data.data.expireTime)
    if (!isNaN(parsed.getTime())) expiresAt = parsed
  }

  return {
    accessToken: data.data.accessToken,
    refreshToken: data.data.refreshToken,
    expiresAt,
    scope: data.data.scope,
  }
}

export async function refreshAccessToken(
  handle: string,
  credentials: Credentials,
  appKey: string,
  appSecret: string,
): Promise<Credentials> {
  const host = storeHost(handle)
  // Refresh requires no body; sign is HMAC of ('' + timestamp).
  const timestamp = String(Date.now())
  const sign = buildSign(appSecret, '', timestamp)

  const { data } = await axios.post<ShoplineTokenResponse>(
    `https://${host}/admin/oauth/token/refresh`,
    undefined,
    {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${credentials.accessToken}`,
        appkey: appKey,
        timestamp,
        sign,
      },
    },
  )

  if (data.code !== 200 || !data.data?.accessToken) {
    throw new Error(`SHOPLINE token refresh failed: ${data.message ?? JSON.stringify(data)}`)
  }

  let expiresAt: Date | undefined
  if (data.data.expireTime) {
    const parsed = new Date(data.data.expireTime)
    if (!isNaN(parsed.getTime())) expiresAt = parsed
  }

  return {
    accessToken: data.data.accessToken,
    refreshToken: data.data.refreshToken ?? credentials.refreshToken,
    expiresAt,
    scope: data.data.scope ?? credentials.scope,
  }
}
