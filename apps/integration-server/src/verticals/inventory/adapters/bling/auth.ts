/**
 * Bling OAuth2 authentication helpers.
 *
 * Bling uses the standard authorization-code grant.
 * Authorize:  GET  https://api.bling.com.br/Api/v3/oauth/authorize
 * Token:      POST https://api.bling.com.br/Api/v3/oauth/token
 *             body: grant_type=authorization_code&code=<code>
 *             auth: HTTP Basic  (client_id:client_secret, base64)
 * Refresh:    POST same token URL with grant_type=refresh_token&refresh_token=<token>
 *
 * Access token expires in 21600 s (6 h). Refresh token expires in 30 days.
 */
import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { AUTHORIZE_URL, TOKEN_URL } from './constants'

export interface BlingOAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
}

export function getAuthUrl(config: BlingOAuthConfig, state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    state,
  })
  return `${AUTHORIZE_URL}?${params.toString()}`
}

export async function exchangeCode(
  config: BlingOAuthConfig,
  code: string,
): Promise<Credentials> {
  const basicAuth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')
  const { data } = await axios.post<{
    access_token: string
    refresh_token: string
    expires_in: number
    token_type: string
    scope: string
  }>(
    TOKEN_URL,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.redirectUri,
    }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicAuth}`,
      },
    },
  )
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    extra: {
      expiresIn: data.expires_in,
      scope: data.scope,
    },
  }
}

export async function refreshCredentials(
  config: BlingOAuthConfig,
  credentials: Credentials,
): Promise<Credentials> {
  const refreshToken = credentials.refreshToken
  if (!refreshToken) return credentials
  const basicAuth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')
  const { data } = await axios.post<{
    access_token: string
    refresh_token: string
    expires_in: number
    token_type: string
    scope: string
  }>(
    TOKEN_URL,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${basicAuth}`,
      },
    },
  )
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    extra: {
      expiresIn: data.expires_in,
      scope: data.scope,
    },
  }
}
