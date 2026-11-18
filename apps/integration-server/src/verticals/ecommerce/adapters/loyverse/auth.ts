/**
 * Loyverse OAuth2 helpers.
 *
 * Loyverse uses the OAuth 2.0 Authorization Code Flow. The authorize URL is
 * on a shared cloud host (cloud.loyverse.com); the token endpoint lives on
 * api.loyverse.com. Token exchange uses application/x-www-form-urlencoded,
 * NOT JSON.
 *
 * Access tokens expire after `expires_in` seconds. Refresh tokens are
 * long-lived and should be stored to obtain new access tokens via
 * `refreshAccessToken`.
 *
 * Docs: https://developer.loyverse.com/docs/#tag/OAuth2
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { OAUTH_AUTHORIZE_URL, OAUTH_TOKEN_URL } from './constants'

export function buildAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string,
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    state,
  })
  return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`
}

interface LoyverseTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
}

export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<Credentials> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code,
  })

  const { data } = await axios.post<LoyverseTokenResponse>(OAUTH_TOKEN_URL, body.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
  })

  const expiresAt =
    data.expires_in != null
      ? new Date(Date.now() + data.expires_in * 1000)
      : undefined

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt,
  }
}

export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  })

  const { data } = await axios.post<LoyverseTokenResponse>(OAUTH_TOKEN_URL, body.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
  })

  const expiresAt =
    data.expires_in != null
      ? new Date(Date.now() + data.expires_in * 1000)
      : undefined

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt,
  }
}
