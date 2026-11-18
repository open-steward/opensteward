/**
 * Gumroad OAuth2 auth helpers.
 *
 * Gumroad uses a standard OAuth2 authorization-code flow.
 * Access tokens are long-lived and do NOT expire by default.
 *
 * Credentials layout:
 *
 *  - `accessToken`            Gumroad access token (long-lived)
 *  - `refreshToken`           Gumroad refresh token (optional)
 *  - `extra.applicationId`    Gumroad application id (client id)
 *  - `extra.applicationSecret` Gumroad application secret (client secret)
 *
 * Docs: https://gumroad.com/api#oauth
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { AUTH_URL, TOKEN_ENDPOINT } from './constants'

/**
 * Build the Gumroad OAuth2 authorization URL.
 */
export function buildAuthUrl(
  applicationId: string,
  redirectUri: string,
  state: string,
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: applicationId,
    redirect_uri: redirectUri,
    state,
  })
  return `${AUTH_URL}?${params.toString()}`
}

interface GumroadTokenResponse {
  access_token: string
  refresh_token?: string
  token_type: string
  scope?: string
}

/**
 * Exchange an authorization code for tokens.
 */
export async function exchangeCode(
  applicationId: string,
  applicationSecret: string,
  code: string,
  redirectUri: string,
): Promise<{ accessToken: string; refreshToken?: string }> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: applicationId,
    client_secret: applicationSecret,
    code,
    redirect_uri: redirectUri,
  })
  const res = await axios.post<GumroadTokenResponse>(TOKEN_ENDPOINT, body.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    timeout: 30_000,
  })
  const { access_token, refresh_token } = res.data
  if (!access_token) {
    throw new Error('Gumroad token endpoint returned an empty access_token')
  }
  return {
    accessToken: access_token,
    refreshToken: refresh_token,
  }
}

/**
 * Refresh Gumroad credentials.
 *
 * Gumroad tokens are long-lived and generally don't need refreshing.
 * If a refresh_token is present, we attempt a refresh; otherwise we
 * return the credentials as-is.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const refreshToken = credentials.refreshToken
  if (!refreshToken) {
    // Gumroad tokens are long-lived — no refresh needed
    return credentials
  }

  const applicationId = credentials.extra?.['applicationId'] as string | undefined
  const applicationSecret = credentials.extra?.['applicationSecret'] as string | undefined
  if (!applicationId || !applicationSecret) {
    throw new Error(
      'Gumroad refreshCredentials requires applicationId and applicationSecret in credentials.extra.',
    )
  }

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: applicationId,
    client_secret: applicationSecret,
    refresh_token: refreshToken,
  })
  const res = await axios.post<GumroadTokenResponse>(TOKEN_ENDPOINT, body.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    timeout: 30_000,
  })
  const { access_token, refresh_token } = res.data
  if (!access_token) {
    throw new Error('Gumroad token endpoint returned an empty access_token on refresh')
  }
  return {
    ...credentials,
    accessToken: access_token,
    refreshToken: refresh_token ?? refreshToken,
  }
}
