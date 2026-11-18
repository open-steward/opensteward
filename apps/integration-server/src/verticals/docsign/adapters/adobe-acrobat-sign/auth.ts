/**
 * Adobe Acrobat Sign OAuth helpers (Adobe IMS Authorization Code grant).
 *
 * Adobe Sign documents the OAuth flow under the Adobe Sign hostname, not
 * the canonical Adobe IMS endpoints, because Sign predates the Adobe IMS
 * consolidation. Scopes are colon-delimited (`agreement_read:account`).
 *
 * Docs: https://opensource.adobe.com/acrobat-sign/developer_guide/oauth.html
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import {
  DEFAULT_BASE_URI,
  OAUTH_AUTHORIZE_URL,
  OAUTH_TOKEN_URL,
  OAUTH_REFRESH_URL,
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
    redirect_uri: redirectUri,
    scope: scopes.join(' '),
    state,
  })
  return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`
}

interface AdobeSignTokenResponse {
  access_token: string
  refresh_token?: string
  api_access_point?: string
  web_access_point?: string
  token_type: string
  expires_in: number
}

export async function exchangeCode(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const { data } = await axios.post<AdobeSignTokenResponse>(
    OAUTH_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
    }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    },
  )
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    extra: {
      apiAccessPoint: data.api_access_point ?? DEFAULT_BASE_URI,
      webAccessPoint: data.web_access_point,
    },
  }
}

export async function refreshCredentials(
  credentials: Credentials,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  if (!credentials.refreshToken) return credentials
  const { data } = await axios.post<AdobeSignTokenResponse>(
    OAUTH_REFRESH_URL,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: credentials.refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    },
  )
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? credentials.refreshToken,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
    extra: credentials.extra ?? {},
  }
}
