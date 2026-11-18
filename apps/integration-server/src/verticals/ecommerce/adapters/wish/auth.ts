/**
 * Wish OAuth2 helpers.
 *
 * Wish uses OAuth 2.0 Authorization Code flow:
 *  1. Redirect merchant to the authorize URL.
 *  2. Exchange the returned `code` via GET request to the token endpoint
 *     (Wish uses GET, not POST, for token exchange — note the unusual verb).
 *  3. Store the access token and refresh token. Access tokens expire after
 *     30 days; use `refreshCredentials` to get a fresh pair.
 *
 * The access token is passed as `Authorization: Bearer <token>` on every
 * API request. Alternatively it can be sent as the `access_token` query
 * parameter, but header auth is preferred.
 *
 * Docs: https://merchant.wish.com/documentation/api/v3/oauth
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import {
  OAUTH_AUTHORIZE_URL,
  OAUTH_AUTHORIZE_URL_SANDBOX,
  OAUTH_TOKEN_URL,
  OAUTH_REFRESH_URL,
  ACCESS_TOKEN_TTL_SECONDS,
} from './constants'

interface WishTokenResponse {
  /** Always 0 on success. */
  code: number
  data?: {
    access_token: string
    refresh_token: string
    /** Merchant user ID that authorized the client. */
    merchant_id?: string
  }
  message?: string
}

export function buildAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string,
  sandbox = false,
): string {
  const base = sandbox ? OAUTH_AUTHORIZE_URL_SANDBOX : OAUTH_AUTHORIZE_URL
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    state,
    response_type: 'code',
  })
  return `${base}?${params.toString()}`
}

export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<Credentials> {
  // Wish uses GET for token exchange — atypical but documented.
  const { data } = await axios.get<WishTokenResponse>(OAUTH_TOKEN_URL, {
    params: {
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    },
    headers: { Accept: 'application/json' },
  })

  if (data.code !== 0 || !data.data) {
    throw new Error(`Wish token exchange failed: ${data.message ?? 'unknown error'}`)
  }

  return {
    accessToken: data.data.access_token,
    refreshToken: data.data.refresh_token,
    expiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000),
    extra: {
      merchantId: data.data.merchant_id,
    },
  }
}

export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const { data } = await axios.get<WishTokenResponse>(OAUTH_REFRESH_URL, {
    params: {
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    },
    headers: { Accept: 'application/json' },
  })

  if (data.code !== 0 || !data.data) {
    throw new Error(`Wish token refresh failed: ${data.message ?? 'unknown error'}`)
  }

  return {
    accessToken: data.data.access_token,
    refreshToken: data.data.refresh_token,
    expiresAt: new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000),
    extra: {
      merchantId: data.data.merchant_id,
    },
  }
}
