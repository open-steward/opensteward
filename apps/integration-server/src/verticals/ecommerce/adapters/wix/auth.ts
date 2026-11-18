/**
 * Wix OAuth2 helpers.
 *
 * Wix uses the App Market install flow. Access tokens expire in ~5 minutes.
 * Refresh tokens are long-lived. Refresh is done via
 * `POST https://www.wixapis.com/oauth/access` with `grant_type=refresh_token`.
 *
 * Docs: https://dev.wix.com/docs/rest/articles/getting-started/authentication
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { TOKEN_LIFETIME_SECONDS } from './constants'

export function buildAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string,
): string {
  const params = new URLSearchParams({
    appId: clientId,
    redirectUrl: redirectUri,
    state,
  })
  return `https://www.wix.com/installer/install?${params.toString()}`
}

interface WixTokenResponse {
  access_token: string
  refresh_token: string
  expires_in?: number
}

export async function exchangeCode(
  code: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const { data } = await axios.post<WixTokenResponse>(
    'https://www.wixapis.com/oauth/access',
    {
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      code,
    },
    {
      headers: {
        'Content-Type': 'application/json',
      },
    },
  )

  const expiresIn = data.expires_in ?? TOKEN_LIFETIME_SECONDS
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + expiresIn * 1000),
  }
}

export async function refreshAccessToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const { data } = await axios.post<WixTokenResponse>(
    'https://www.wixapis.com/oauth/access',
    {
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    },
    {
      headers: {
        'Content-Type': 'application/json',
      },
    },
  )

  const expiresIn = data.expires_in ?? TOKEN_LIFETIME_SECONDS
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? refreshToken,
    expiresAt: new Date(Date.now() + expiresIn * 1000),
  }
}
