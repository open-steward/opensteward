/**
 * Square OAuth 2.0 — authorization-code flow.
 * Docs: https://developer.squareup.com/docs/oauth-api/overview
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { OAUTH_AUTHORIZE_URL, OAUTH_TOKEN_URL } from './constants'

export function buildAuthUrl(
  clientId: string,
  redirectUri: string,
  scopes: string[],
  state: string,
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    scope: scopes.join(' '),
    session: 'false',
    redirect_uri: redirectUri,
    state,
  })
  return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`
}

interface SquareTokenResponse {
  access_token: string
  refresh_token: string
  expires_at: string
  merchant_id?: string
}

export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const { data } = await axios.post<SquareTokenResponse>(OAUTH_TOKEN_URL, {
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: 'authorization_code',
  })
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(data.expires_at),
    extra: { merchantId: data.merchant_id ?? '' },
  }
}

export async function refreshCredentials(
  credentials: Credentials,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  if (!credentials.refreshToken) return credentials
  const { data } = await axios.post<SquareTokenResponse>(OAUTH_TOKEN_URL, {
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
    refresh_token: credentials.refreshToken,
  })
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? credentials.refreshToken,
    expiresAt: new Date(data.expires_at),
    extra: credentials.extra,
  }
}
