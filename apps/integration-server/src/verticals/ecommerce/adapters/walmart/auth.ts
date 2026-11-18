/**
 * Walmart Marketplace OAuth2 auth helpers — client-credentials flow.
 *
 * Walmart uses client-credentials grant (no user redirect). Sellers
 * provide a clientId + clientSecret from their Walmart Developer Portal.
 * Access tokens have a short TTL (~900s / 15 minutes).
 *
 * Credentials layout:
 *   - `accessToken`         Walmart access token (~15m TTL)
 *   - `expiresAt`           Date the access token expires
 *   - `extra.clientId`      Walmart client id
 *   - `extra.clientSecret`  Walmart client secret
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { TOKEN_URL, TOKEN_BUFFER_MS } from './constants'

interface WalmartTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
}

/**
 * Obtain an access token using client-credentials grant.
 *
 * Walmart's token endpoint expects Basic auth with clientId:clientSecret
 * and `grant_type=client_credentials` in the body.
 */
export async function getAccessToken(
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const body = new URLSearchParams({ grant_type: 'client_credentials' })

  const res = await axios.post<WalmartTokenResponse>(TOKEN_URL, body.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basic}`,
      Accept: 'application/json',
      'WM_SVC.NAME': 'Walmart Marketplace',
      'WM_QOS.CORRELATION_ID': crypto.randomUUID(),
    },
    timeout: 30_000,
  })

  const { access_token, expires_in } = res.data
  if (!access_token) {
    throw new Error('Walmart token endpoint returned an empty access_token')
  }

  const ttlMs = Math.max(0, expires_in * 1000 - TOKEN_BUFFER_MS)
  return {
    accessToken: access_token,
    expiresAt: new Date(Date.now() + ttlMs),
    extra: { clientId, clientSecret },
  }
}

/**
 * Refresh Walmart credentials. Since Walmart uses client-credentials
 * (no refresh token), we simply request a new access token.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const clientId = credentials.extra?.['clientId'] as string | undefined
  const clientSecret = credentials.extra?.['clientSecret'] as string | undefined
  if (!clientId || !clientSecret) {
    throw new Error(
      'Walmart refreshCredentials requires clientId and clientSecret in ' +
        'credentials.extra — one or both were missing. Re-create the connection.',
    )
  }
  return getAccessToken(clientId, clientSecret)
}
