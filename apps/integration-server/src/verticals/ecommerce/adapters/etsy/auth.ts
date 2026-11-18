/**
 * Etsy OAuth2 auth helpers — authorization-code flow with PKCE.
 *
 * Etsy's Open API v3 uses a standard OAuth2 authorization-code flow.
 * Access tokens expire after 1 hour. Refresh tokens are long-lived and
 * do NOT rotate on refresh (the same refresh token can be reused).
 *
 * Credentials layout used by this adapter:
 *
 *  - `accessToken`       Etsy access token (1h TTL)
 *  - `refreshToken`      Etsy refresh token (long-lived)
 *  - `expiresAt`         Date the access token expires
 *  - `extra.apiKeyString` Etsy API key (also called "keystring" or client id)
 *  - `extra.shopId`      The seller's Etsy shop id (numeric)
 *
 * Docs: https://developers.etsy.com/documentation/essentials/authentication
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { TOKEN_ENDPOINT, TOKEN_BUFFER_MS } from './constants'

/**
 * Build the Etsy OAuth2 authorization URL. Callers must append their own
 * PKCE `code_challenge` and `code_challenge_method` parameters.
 */
export function buildAuthUrl(apiKeyString: string, redirectUri: string, state: string, scopes?: string[]): string {
  const defaultScopes = ['transactions_r', 'transactions_w', 'listings_r', 'listings_w', 'shops_r', 'shops_w']
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: apiKeyString,
    redirect_uri: redirectUri,
    scope: (scopes ?? defaultScopes).join(' '),
    state,
  })
  return `https://www.etsy.com/oauth/connect?${params.toString()}`
}

interface EtsyTokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
}

/**
 * Exchange an authorization code for tokens via the Etsy token endpoint.
 */
export async function exchangeCode(
  apiKeyString: string,
  code: string,
  redirectUri: string,
  codeVerifier: string,
): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date }> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: apiKeyString,
    code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  })
  const res = await axios.post<EtsyTokenResponse>(TOKEN_ENDPOINT, body.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    timeout: 30_000,
  })
  const { access_token, refresh_token, expires_in } = res.data
  if (!access_token) {
    throw new Error('Etsy token endpoint returned an empty access_token')
  }
  const ttlMs = Math.max(0, expires_in * 1000 - TOKEN_BUFFER_MS)
  return {
    accessToken: access_token,
    refreshToken: refresh_token,
    expiresAt: new Date(Date.now() + ttlMs),
  }
}

/**
 * Refresh an expired access token using the stored refresh token.
 * Etsy does NOT rotate the refresh token on refresh.
 */
export async function fetchAccessToken(
  apiKeyString: string,
  refreshToken: string,
): Promise<{ accessToken: string; expiresAt: Date }> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: apiKeyString,
    refresh_token: refreshToken,
  })
  const res = await axios.post<EtsyTokenResponse>(TOKEN_ENDPOINT, body.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    timeout: 30_000,
  })
  const { access_token, expires_in } = res.data
  if (!access_token) {
    throw new Error('Etsy token endpoint returned an empty access_token')
  }
  const ttlMs = Math.max(0, expires_in * 1000 - TOKEN_BUFFER_MS)
  return {
    accessToken: access_token,
    expiresAt: new Date(Date.now() + ttlMs),
  }
}

/**
 * Refresh Etsy credentials. Requires `refreshToken` on the credentials
 * and `apiKeyString` in `extra`.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const apiKeyString = credentials.extra?.['apiKeyString'] as string | undefined
  const refreshToken = credentials.refreshToken
  if (!apiKeyString || !refreshToken) {
    throw new Error(
      'Etsy refreshCredentials requires refreshToken plus apiKeyString in credentials.extra — ' +
        'one or more were missing. Re-create the connection.',
    )
  }
  const { accessToken, expiresAt } = await fetchAccessToken(apiKeyString, refreshToken)
  return {
    ...credentials,
    accessToken,
    refreshToken,
    expiresAt,
  }
}
