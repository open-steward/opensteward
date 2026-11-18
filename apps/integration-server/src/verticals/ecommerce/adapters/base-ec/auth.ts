/**
 * BASE OAuth2 helpers — standard authorization-code flow (RFC 6749/6750),
 * one deployment-wide app.
 *
 * Unlike Shopify/ePages, BASE has no per-shop host: `client_id`/
 * `client_secret` are configured once for the whole OpenSteward deployment
 * (see `BaseEcAdapterConfig`) and every connected shop authorizes against
 * the same global `api.thebase.in` endpoints.
 *
 * Access tokens are short-lived; BASE explicitly documents that it issues a
 * refresh token alongside the access token ("リフレッシュトークンも発行しています")
 * — `refreshCredentials` re-runs the `refresh_token` grant to mint a new one.
 *
 * Docs: https://docs.thebase.in/api/oauth/authorize (authorize params),
 * https://docs.thebase.in/api/ (OAuth overview: `Authorization: Bearer
 * {Access_Token}` header, refresh tokens, RFC 6749/6750 reference).
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { AUTHORIZE_URL, TOKEN_URL } from './constants'

/**
 * Build the BASE authorize URL.
 *
 * Confirmed params (https://docs.thebase.in/api/oauth/authorize):
 * `response_type=code` (required), `client_id` (required), `redirect_uri`
 * (required, must match the registered callback), `scope` (optional,
 * space-separated, defaults to `read_users`), `state` (optional, echoed back
 * unchanged on the callback).
 */
export function buildAuthUrl(
  clientId: string,
  redirectUri: string,
  scopes: string[],
  state: string,
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: scopes.join(' '),
    state,
  })
  return `${AUTHORIZE_URL}?${params.toString()}`
}

interface BaseEcTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
  scope?: string
}

async function requestToken(body: URLSearchParams): Promise<Credentials> {
  const { data } = await axios.post<BaseEcTokenResponse>(TOKEN_URL, body.toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    timeout: 30_000,
  })
  if (!data.access_token) {
    throw new Error('BASE token endpoint returned an empty access_token')
  }
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt:
      typeof data.expires_in === 'number' ? new Date(Date.now() + data.expires_in * 1000) : undefined,
    scope: data.scope,
  }
}

/** Exchange an authorization code for tokens (`grant_type=authorization_code`). */
export function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<Credentials> {
  return requestToken(
    new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  )
}

/**
 * Refresh an expired access token (`grant_type=refresh_token`). `clientId`/
 * `clientSecret` come from deployment config, not from the stored
 * credentials — this is a single deployment-wide app.
 */
export async function refreshCredentials(
  credentials: Credentials,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  if (!credentials.refreshToken) {
    throw new Error('BASE refreshCredentials requires a refreshToken — re-connect this shop.')
  }
  const refreshed = await requestToken(
    new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: credentials.refreshToken,
    }),
  )
  return {
    ...credentials,
    ...refreshed,
    // BASE's token response may omit refresh_token on refresh; keep the
    // existing one rather than dropping it.
    refreshToken: refreshed.refreshToken ?? credentials.refreshToken,
  }
}
