/**
 * Bol.com OAuth2 auth helpers — client-credentials flow.
 *
 * Bol.com uses OAuth2 client-credentials grant (no user consent step).
 * The retailer provides their API client_id and client_secret, which are
 * exchanged for a short-lived access token (~5 minutes).
 *
 * Because there is no authorization-code step, `getAuthUrl` and
 * `exchangeCode` are no-ops. The adapter always uses
 * `refreshCredentials` to obtain/renew the bearer token.
 *
 * Credentials layout:
 *   - `accessToken`          Bearer token (~5min TTL)
 *   - `expiresAt`            Date the access token expires
 *   - `extra.clientId`       Bol.com API client id
 *   - `extra.clientSecret`   Bol.com API client secret
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { OAUTH_TOKEN_URL, TOKEN_BUFFER_MS } from './constants'

interface BolTokenResponse {
  access_token: string
  token_type: string
  expires_in: number
  scope: string
}

/**
 * Obtain a new access token using client credentials.
 */
export async function obtainAccessToken(
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const res = await axios.post<BolTokenResponse>(
    OAUTH_TOKEN_URL,
    'grant_type=client_credentials',
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basic}`,
        Accept: 'application/json',
      },
      timeout: 30_000,
    },
  )
  const { access_token, expires_in } = res.data
  if (!access_token) {
    throw new Error('Bol.com token endpoint returned an empty access_token')
  }
  const ttlMs = Math.max(0, expires_in * 1000 - TOKEN_BUFFER_MS)
  return {
    accessToken: access_token,
    expiresAt: new Date(Date.now() + ttlMs),
    extra: { clientId, clientSecret },
  }
}

/**
 * Refresh Bol.com credentials. Since this is client-credentials, we
 * simply request a new token using the stored client id/secret.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const clientId = credentials.extra?.['clientId'] as string | undefined
  const clientSecret = credentials.extra?.['clientSecret'] as string | undefined
  if (!clientId || !clientSecret) {
    throw new Error(
      'Bol.com refreshCredentials requires clientId and clientSecret in ' +
        'credentials.extra — one or more were missing. Re-create the connection.',
    )
  }
  return obtainAccessToken(clientId, clientSecret)
}
