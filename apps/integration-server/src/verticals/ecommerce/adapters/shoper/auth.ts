/**
 * Shoper AppStore OAuth2 helpers.
 *
 * Shoper's AppStore uses a standard authorization-code OAuth2 flow.  The
 * authorize and token endpoints live on the store's own domain, under the
 * `webapi/rest/oauth` path.  Access tokens expire after ~90 days; refresh
 * tokens after ~180 days.
 *
 * Docs: https://developers.shoper.pl/developers/appstore/oauth/
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'

/** Normalize the store URL: strip trailing slash, ensure https scheme. */
function storeBase(storeUrl: string): string {
  const url = storeUrl.replace(/\/$/, '')
  if (url.startsWith('http')) return url
  return `https://${url}`
}

export function buildAuthUrl(
  storeUrl: string,
  clientId: string,
  redirectUri: string,
  scopes: string[],
  state: string,
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    scope: scopes.join(' '),
    redirect_uri: redirectUri,
    state,
  })
  return `${storeBase(storeUrl)}/webapi/rest/oauth/authorize?${params.toString()}`
}

interface ShoperTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
  scope?: string
}

export async function exchangeCode(
  storeUrl: string,
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<Credentials> {
  const base = storeBase(storeUrl)
  const { data } = await axios.post<ShoperTokenResponse>(
    `${base}/webapi/rest/oauth/token`,
    new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    },
  )

  const expiresAt =
    typeof data.expires_in === 'number'
      ? new Date(Date.now() + data.expires_in * 1000)
      : undefined

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt,
    scope: data.scope,
    extra: {
      clientId,
      clientSecret,
      storeUrl: base,
      redirectUri,
    },
  }
}

export async function refreshAccessToken(credentials: Credentials): Promise<Credentials> {
  const storeUrl = credentials.extra?.['storeUrl'] as string | undefined
  const clientId = credentials.extra?.['clientId'] as string | undefined
  const clientSecret = credentials.extra?.['clientSecret'] as string | undefined
  const redirectUri = credentials.extra?.['redirectUri'] as string | undefined
  const refreshToken = credentials.refreshToken

  if (!storeUrl || !clientId || !clientSecret || !refreshToken) {
    // Cannot refresh — return unchanged credentials.
    return credentials
  }

  const { data } = await axios.post<ShoperTokenResponse>(
    `${storeBase(storeUrl)}/webapi/rest/oauth/token`,
    new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      ...(redirectUri ? { redirect_uri: redirectUri } : {}),
    }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    },
  )

  const expiresAt =
    typeof data.expires_in === 'number'
      ? new Date(Date.now() + data.expires_in * 1000)
      : undefined

  return {
    ...credentials,
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? credentials.refreshToken,
    expiresAt,
    scope: data.scope ?? credentials.scope,
  }
}
