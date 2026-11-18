/**
 * eBay OAuth2 auth helpers — authorization-code + refresh-token flow.
 *
 * eBay uses standard OAuth2 authorization code grant. Sellers consent via
 * eBay's OAuth2 authorize endpoint; we exchange the code for access +
 * refresh tokens. Access tokens expire in 2 hours, refresh tokens last
 * 18 months.
 *
 * Credentials layout:
 *   - `accessToken`        eBay user access token (2h TTL)
 *   - `refreshToken`       eBay refresh token (18mo TTL)
 *   - `expiresAt`          Date the access token expires
 *   - `extra.clientId`     eBay app client id
 *   - `extra.clientSecret` eBay app client secret
 *   - `extra.environment`  'production' | 'sandbox'
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { basicAuth } from '@opensteward/shared'
import {
  OAUTH_AUTHORIZE_URL,
  OAUTH_TOKEN_URL,
  OAUTH_TOKEN_URL_SANDBOX,
  TOKEN_BUFFER_MS,
} from './constants'

/**
 * Build the eBay OAuth2 consent URL. The `state` param is passed through
 * eBay's authorize endpoint for CSRF protection.
 */
export function buildAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string,
  scopes: string[] = [
    'https://api.ebay.com/oauth/api_scope/sell.inventory',
    'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
    'https://api.ebay.com/oauth/api_scope/sell.finances',
  ],
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    scope: scopes.join(' '),
    state,
  })
  return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`
}

interface EbayTokenResponse {
  access_token: string
  refresh_token?: string
  token_type: string
  expires_in: number
}

function tokenUrl(environment: string): string {
  return environment === 'sandbox' ? OAUTH_TOKEN_URL_SANDBOX : OAUTH_TOKEN_URL
}


/**
 * Exchange an authorization code for access + refresh tokens.
 */
export async function exchangeCode(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
  environment = 'production',
): Promise<Credentials> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  })
  const res = await axios.post<EbayTokenResponse>(tokenUrl(environment), body.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth(clientId, clientSecret)}`,
      Accept: 'application/json',
    },
    timeout: 30_000,
  })
  const { access_token, refresh_token, expires_in } = res.data
  if (!access_token) {
    throw new Error('eBay token endpoint returned an empty access_token')
  }
  const ttlMs = Math.max(0, expires_in * 1000 - TOKEN_BUFFER_MS)
  return {
    accessToken: access_token,
    refreshToken: refresh_token,
    expiresAt: new Date(Date.now() + ttlMs),
    extra: { clientId, clientSecret, environment },
  }
}

/**
 * Refresh eBay credentials using the stored refresh token.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const clientId = credentials.extra?.['clientId'] as string | undefined
  const clientSecret = credentials.extra?.['clientSecret'] as string | undefined
  const refreshToken = credentials.refreshToken
  const environment = (credentials.extra?.['environment'] as string | undefined) ?? 'production'
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'eBay refreshCredentials requires refreshToken plus clientId and clientSecret ' +
        'in credentials.extra — one or more were missing. Re-create the connection.',
    )
  }
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    scope: [
      'https://api.ebay.com/oauth/api_scope/sell.inventory',
      'https://api.ebay.com/oauth/api_scope/sell.fulfillment',
      'https://api.ebay.com/oauth/api_scope/sell.finances',
    ].join(' '),
  })
  const res = await axios.post<EbayTokenResponse>(tokenUrl(environment), body.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${basicAuth(clientId, clientSecret)}`,
      Accept: 'application/json',
    },
    timeout: 30_000,
  })
  const { access_token, expires_in } = res.data
  if (!access_token) {
    throw new Error('eBay token endpoint returned an empty access_token')
  }
  const ttlMs = Math.max(0, expires_in * 1000 - TOKEN_BUFFER_MS)
  return {
    ...credentials,
    accessToken: access_token,
    refreshToken, // eBay does not rotate refresh tokens
    expiresAt: new Date(Date.now() + ttlMs),
  }
}
