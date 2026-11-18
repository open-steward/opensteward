/**
 * Pinterest OAuth2 auth helpers.
 *
 * Pinterest uses a standard OAuth2 authorization-code flow with short-lived
 * access tokens (~1 hour) and long-lived refresh tokens.
 *
 * Credentials layout:
 *
 *  - `accessToken`              Pinterest access token (short-lived, ~1h)
 *  - `refreshToken`             Pinterest refresh token (long-lived)
 *  - `extra.clientId`           Pinterest app ID
 *  - `extra.clientSecret`       Pinterest app secret
 *
 * Docs: https://developers.pinterest.com/docs/getting-started/authentication/
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { AUTH_URL, TOKEN_ENDPOINT, SCOPES } from './constants'

/**
 * Build the Pinterest OAuth2 authorization URL.
 */
export function buildAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string,
  scopes?: string[],
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: (scopes ?? SCOPES).join(','),
    state,
  })
  return `${AUTH_URL}?${params.toString()}`
}

interface PinterestTokenResponse {
  access_token: string
  refresh_token?: string
  token_type: string
  expires_in?: number
  scope?: string
}

/**
 * Exchange an authorization code for tokens.
 *
 * Pinterest requires HTTP Basic auth (client_id:client_secret) on the token endpoint.
 */
export async function exchangeCode(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string,
): Promise<{ accessToken: string; refreshToken?: string }> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  })
  const res = await axios.post<PinterestTokenResponse>(TOKEN_ENDPOINT, body.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    auth: { username: clientId, password: clientSecret },
    timeout: 30_000,
  })
  const { access_token, refresh_token } = res.data
  if (!access_token) {
    throw new Error('Pinterest token endpoint returned an empty access_token')
  }
  return {
    accessToken: access_token,
    refreshToken: refresh_token,
  }
}

/**
 * Refresh Pinterest credentials.
 *
 * Pinterest access tokens expire after ~1 hour. Refresh tokens are long-lived.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const refreshToken = credentials.refreshToken
  if (!refreshToken) {
    return credentials
  }

  const clientId = credentials.extra?.['clientId'] as string | undefined
  const clientSecret = credentials.extra?.['clientSecret'] as string | undefined
  if (!clientId || !clientSecret) {
    throw new Error(
      'Pinterest refreshCredentials requires clientId and clientSecret in credentials.extra.',
    )
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  })
  const res = await axios.post<PinterestTokenResponse>(TOKEN_ENDPOINT, body.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    auth: { username: clientId, password: clientSecret },
    timeout: 30_000,
  })
  const { access_token, refresh_token } = res.data
  if (!access_token) {
    throw new Error('Pinterest token endpoint returned an empty access_token on refresh')
  }
  return {
    ...credentials,
    accessToken: access_token,
    refreshToken: refresh_token ?? refreshToken,
  }
}
