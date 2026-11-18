/**
 * Shoplazza OAuth2 helpers.
 *
 * Shoplazza's OAuth2 is per-shop. Authorization and token endpoints live on
 * the merchant's own `{shop}.myshoplaza.com` host. Access tokens have an
 * expiry (`expires_at` Unix timestamp). A refresh token is issued alongside
 * the access token and must be used to obtain a new access token before it
 * expires.
 *
 * Auth URL:   https://{shop}.myshoplaza.com/admin/oauth/authorize
 * Token URL:  POST https://{shop}.myshoplaza.com/admin/oauth/token
 *
 * Docs: https://www.shoplazza.dev/reference/3develop-your-application-service
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { HOST_SUFFIX } from './constants'

/** Normalise a raw shop input to its full host. */
export function shopHost(shop: string): string {
  return shop.endsWith(`.${HOST_SUFFIX}`) ? shop : `${shop}.${HOST_SUFFIX}`
}

export function buildAuthUrl(
  shop: string,
  clientId: string,
  redirectUri: string,
  scopes: string[],
  state: string,
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    scope: scopes.join(' '),
    redirect_uri: redirectUri,
    response_type: 'code',
    state,
  })
  return `https://${shopHost(shop)}/admin/oauth/authorize?${params.toString()}`
}

interface ShoplazzaTokenResponse {
  token_type?: string
  /** Unix timestamp (seconds) when the access token expires. */
  expires_at?: number
  access_token: string
  refresh_token?: string
  store_id?: string
  store_name?: string
}

export async function exchangeCode(
  shop: string,
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<Credentials> {
  const { data } = await axios.post<ShoplazzaTokenResponse>(
    `https://${shopHost(shop)}/admin/oauth/token`,
    {
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    },
  )

  const expiresAt = data.expires_at
    ? new Date(data.expires_at * 1000)
    : undefined

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt,
    extra: {
      storeId: data.store_id,
      storeName: data.store_name,
    },
  }
}

export async function refreshToken(
  shop: string,
  clientId: string,
  clientSecret: string,
  refreshTokenValue: string,
  redirectUri: string,
): Promise<Credentials> {
  const { data } = await axios.post<ShoplazzaTokenResponse>(
    `https://${shopHost(shop)}/admin/oauth/token`,
    {
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshTokenValue,
      grant_type: 'refresh_token',
      redirect_uri: redirectUri,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    },
  )

  const expiresAt = data.expires_at
    ? new Date(data.expires_at * 1000)
    : undefined

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshTokenValue,
    expiresAt,
    extra: {
      storeId: data.store_id,
      storeName: data.store_name,
    },
  }
}
