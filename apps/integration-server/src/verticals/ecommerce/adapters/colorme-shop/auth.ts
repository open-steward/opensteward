/**
 * ColorMe Shop OAuth2 (authorization code) helpers.
 *
 * One global host for every shop: `https://api.shop-pro.jp/oauth/authorize`
 * and `/oauth/token`. Access tokens do not expire ("アクセストークンに有効期限は
 * ありません" — "the access token has no expiration") and no refresh token is
 * ever issued; a token can only be revoked by the merchant from their app-
 * authorization list.
 *
 * Docs: the OpenAPI spec's own `info.description`
 * (https://api.shop-pro.jp/v1/spec/open_api.json), section "利用手順" —
 * fetched and read directly, not summarised:
 *
 *   Authorize: GET https://api.shop-pro.jp/oauth/authorize
 *     ?client_id=...&redirect_uri=...&response_type=code&scope=read_products%20write_products
 *
 *   Token exchange: POST https://api.shop-pro.jp/oauth/token
 *     client_id, client_secret, code, grant_type=authorization_code, redirect_uri
 *     → { "access_token": "...", "token_type": "bearer", "scope": "..." }
 *     (no expires_in, no refresh_token in the documented response)
 *
 *   API calls: `Authorization: Bearer <access_token>`.
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { AUTH_HOST } from './constants'

export function buildAuthUrl(
  clientId: string,
  redirectUri: string,
  scopes: string[],
  state: string,
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    state,
  })
  return `${AUTH_HOST}/oauth/authorize?${params.toString()}`
}

interface ColormeShopTokenResponse {
  access_token: string
  token_type?: string
  scope?: string
}

export async function exchangeCode(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const { data } = await axios.post<ColormeShopTokenResponse>(
    `${AUTH_HOST}/oauth/token`,
    new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
  )
  // No expiresAt, no refreshToken — the platform documents neither.
  return { accessToken: data.access_token, scope: data.scope }
}
