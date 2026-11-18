/**
 * actaSIGN OAuth 2.0 / OpenID Connect helpers.
 *
 * Standard OAuth 2.0 Authorization-Code grant against the actaSIGN identity
 * provider (OpenID Connect). The token endpoint authenticates the client with
 * HTTP Basic; the OIDC userinfo endpoint resolves the signed-in subject and
 * the tenant/organisation the token is scoped to.
 *
 * Docs: https://www.actasign.swiss/en/product (SSO / OpenID Connect)
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import {
  OAUTH_AUTHORIZE_URL,
  OAUTH_TOKEN_URL,
  OAUTH_USERINFO_URL,
} from './constants'

export function buildAuthUrl(
  clientId: string,
  redirectUri: string,
  scopes: string[],
  state: string,
): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    scope: scopes.join(' '),
    redirect_uri: redirectUri,
    state,
  })
  return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`
}

interface ActasignTokenResponse {
  access_token: string
  refresh_token?: string
  token_type: 'Bearer'
  expires_in: number
  scope?: string
}

interface ActasignUserInfo {
  sub: string
  email?: string
  name?: string
  /** OIDC custom claim — the organisation/tenant the token belongs to. */
  organization_id?: string
  organization_name?: string
}

async function fetchUserInfo(accessToken: string): Promise<ActasignUserInfo> {
  const { data } = await axios.get<ActasignUserInfo>(OAUTH_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  })
  return data
}

export async function exchangeCode(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const { data } = await axios.post<ActasignTokenResponse>(
    OAUTH_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basic}`,
        Accept: 'application/json',
      },
    },
  )

  const userInfo = await fetchUserInfo(data.access_token).catch(() => undefined)

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    scope: data.scope,
    extra: {
      userId: userInfo?.sub,
      email: userInfo?.email,
      organizationId: userInfo?.organization_id,
      organizationName: userInfo?.organization_name,
    },
  }
}

export async function refreshCredentials(
  credentials: Credentials,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  if (!credentials.refreshToken) return credentials
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')
  const { data } = await axios.post<ActasignTokenResponse>(
    OAUTH_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: credentials.refreshToken,
    }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basic}`,
        Accept: 'application/json',
      },
    },
  )
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? credentials.refreshToken,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    scope: data.scope ?? credentials.scope,
    extra: credentials.extra ?? {},
  }
}
