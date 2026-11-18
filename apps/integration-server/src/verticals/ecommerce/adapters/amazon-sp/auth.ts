/**
 * Amazon SP-API auth helpers — Login with Amazon (LWA) refresh-token flow.
 *
 * Amazon's Selling Partner API does not participate in a classic OAuth
 * authorization-code flow from the integrator's perspective. Sellers
 * authorise an application in Seller Central, which hands the developer
 * a long-lived LWA **refresh token** out-of-band. The adapter then
 * exchanges that refresh token for a 1-hour access token on every
 * request (with a 5-minute safety buffer).
 *
 * Credentials layout used by this adapter:
 *
 *  - `accessToken`       LWA access token (1h TTL)
 *  - `refreshToken`      LWA refresh token (long-lived, not rotated)
 *  - `expiresAt`         Date the access token was minted + ~55m
 *  - `extra.clientId`    LWA application client id
 *  - `extra.clientSecret` LWA application client secret
 *  - `extra.region`      'na' | 'eu' | 'fe'
 *  - `extra.sellerId`    Amazon seller id (the merchant account id)
 *
 * Docs: https://developer-docs.amazon.com/sp-api/docs/authorizing-selling-partner-api-applications
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { LWA_TOKEN_ENDPOINT, TOKEN_BUFFER_MS } from './constants'

/**
 * Informational URL — points sellers at the Seller Central app store where
 * the LWA authorisation flow starts. Not a functional OAuth authorize
 * URL from our side.
 */
export function buildAuthUrl(): string {
  return 'https://sellercentral.amazon.com/apps/store/v2/d'
}

export function exchangeCode(): Promise<Credentials> {
  throw new Error(
    'Amazon SP-API does not use a standard OAuth code exchange from the integrator side. ' +
      'Register a developer account and SP-API application with Amazon to obtain a ' +
      'long-lived LWA refresh token, then POST it to /v1/connections with body ' +
      '`{platform: "amazon-sp", credentials: {clientId, clientSecret, refreshToken, region, sellerId}}`. ' +
      'The adapter will exchange the refresh token for access tokens automatically via refreshCredentials.',
  )
}

interface LWATokenResponse {
  access_token: string
  refresh_token?: string
  token_type: string
  expires_in: number
}

/**
 * POST the LWA token endpoint with the stored refresh token and return a
 * fresh access token. Amazon does NOT rotate the refresh token — the
 * response echoes the same value, so we keep the stored one.
 */
export async function fetchAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<{ accessToken: string; expiresAt: Date }> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  })
  const res = await axios.post<LWATokenResponse>(LWA_TOKEN_ENDPOINT, body.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    timeout: 30_000,
  })
  const { access_token, expires_in } = res.data
  if (!access_token) {
    throw new Error('LWA token endpoint returned an empty access_token')
  }
  // Subtract the safety buffer so ensureFresh() refreshes before Amazon
  // actually expires the token.
  const ttlMs = Math.max(0, expires_in * 1000 - TOKEN_BUFFER_MS)
  return {
    accessToken: access_token,
    expiresAt: new Date(Date.now() + ttlMs),
  }
}

/**
 * Refresh Amazon credentials by calling the LWA token endpoint. Requires
 * `refreshToken` on the credentials and `clientId` / `clientSecret` in
 * `extra`.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const clientId = credentials.extra?.['clientId'] as string | undefined
  const clientSecret = credentials.extra?.['clientSecret'] as string | undefined
  const refreshToken = credentials.refreshToken
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Amazon SP-API refreshCredentials requires refreshToken plus clientId and clientSecret ' +
        'in credentials.extra — one or more were missing. Re-create the connection.',
    )
  }
  const { accessToken, expiresAt } = await fetchAccessToken(clientId, clientSecret, refreshToken)
  return {
    ...credentials,
    accessToken,
    refreshToken,
    expiresAt,
  }
}
