/**
 * Flipkart Seller API auth helpers — third-party (authorization-code) flow.
 *
 * Verified against https://seller.flipkart.com/api-docs/FMSAPI.html
 * ("Third-Party Application" section):
 *
 *   1. The seller is sent to
 *      `https://api.flipkart.net/oauth-service/oauth/authorize` with
 *      `client_id`, `redirect_uri` (HTTPS, registered with the application),
 *      `response_type=code`, `scope=Seller_Api` and `state`.
 *   2. The code is exchanged with a GET, params in the query string and the
 *      application's `appId:appSecret` as HTTP Basic auth — the docs' curl:
 *      `curl -u <appid>:<app-secret> https://api.flipkart.net/oauth-service/oauth/token?redirect_uri=<redirect-uri>&grant_type=authorization_code&state=<state>&code=<code>`
 *   3. Refresh is the same GET with `grant_type=refresh_token&refresh_token=…`.
 *
 * Sample response (both grants): `access_token`, `token_type`,
 * `refresh_token`, `expires_in`, `scope`, `refresh_token_expires_in`.
 *
 * The docs' exchange example also carries `state`; the shared callback route
 * does not hand it to `exchangeCode`, and the docs do not mark it required on
 * the token call, so it is not sent.
 *
 * Third-party applications are created by a verified API Partner (Partner
 * Dashboard → Profile → Manage API Access → Create Application) and are
 * operator-level: one appId/appSecret serves every seller that authorizes it.
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { TOKEN_ENDPOINT, AUTH_ENDPOINT, TOKEN_BUFFER_MS } from './constants'

/** The one scope the docs define for the Seller API. */
export const DEFAULT_SCOPES = ['Seller_Api']

/**
 * Build the Flipkart authorize URL. `scopes` replaces the default scope
 * (read-only Connect Links pass their own list).
 */
export function buildAuthUrl(
  appId: string,
  redirectUri: string,
  state: string,
  scopes: string[] = DEFAULT_SCOPES,
): string {
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: scopes.join(' '),
    state,
  })
  return `${AUTH_ENDPOINT}?${params.toString()}`
}

interface FlipkartTokenResponse {
  access_token: string
  token_type?: string
  refresh_token?: string
  expires_in?: number
  scope?: string
  refresh_token_expires_in?: number
}

function basicAuth(appId: string, appSecret: string): string {
  return `Basic ${Buffer.from(`${appId}:${appSecret}`).toString('base64')}`
}

async function requestToken(
  appId: string,
  appSecret: string,
  params: Record<string, string>,
): Promise<FlipkartTokenResponse> {
  const res = await axios.get<FlipkartTokenResponse>(TOKEN_ENDPOINT, {
    params,
    headers: {
      Accept: 'application/json',
      Authorization: basicAuth(appId, appSecret),
    },
    timeout: 30_000,
  })
  if (!res.data?.access_token) {
    throw new Error('Flipkart token endpoint returned an empty access_token')
  }
  return res.data
}

function toCredentials(data: FlipkartTokenResponse, previous?: Credentials): Credentials {
  const expiresAt =
    typeof data.expires_in === 'number'
      ? new Date(Date.now() + Math.max(0, data.expires_in * 1000 - TOKEN_BUFFER_MS))
      : undefined
  return {
    ...previous,
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? previous?.refreshToken,
    expiresAt,
    scope: data.scope ?? previous?.scope,
  }
}

/** Exchange an authorization code for an access + refresh token pair. */
export async function exchangeCode(
  appId: string,
  appSecret: string,
  code: string,
  redirectUri: string,
): Promise<Credentials> {
  const data = await requestToken(appId, appSecret, {
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
    code,
  })
  return toCredentials(data)
}

/** Re-mint the access token from the stored refresh token. */
export async function refreshAccessToken(
  credentials: Credentials,
  appId: string,
  appSecret: string,
): Promise<Credentials> {
  if (!credentials.refreshToken) {
    throw new Error('Flipkart refresh requires a refresh token — re-authorize the connection.')
  }
  const data = await requestToken(appId, appSecret, {
    grant_type: 'refresh_token',
    refresh_token: credentials.refreshToken,
  })
  return toCredentials(data, credentials)
}
