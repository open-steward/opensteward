/**
 * Solidus auth helpers.
 *
 * Solidus supports two auth strategies (same as Spree):
 *
 *  1. **OAuth2 (Doorkeeper)** — `POST /oauth/token` with
 *     `grant_type=authorization_code` or `grant_type=client_credentials`.
 *     Returns `{ access_token, token_type, expires_in, refresh_token, created_at }`.
 *
 *  2. **API key (bearer token)** — generated in Solidus admin under
 *     Users > API Access. Passed as `Authorization: Bearer {token}`.
 *
 * Key difference from Spree: Solidus uses `/oauth/` (standard Doorkeeper)
 * instead of `/spree_oauth/`.
 */

import axios from 'axios'
import type { Credentials } from '@opensteward/shared'
import { TOKEN_LIFETIME_MS } from './constants'

export function buildAuthUrl(baseUrl: string, clientId: string, state: string): string {
  const url = new URL('/oauth/authorize', baseUrl)
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('state', state)
  return url.toString()
}

export async function exchangeCode(
  baseUrl: string,
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string,
): Promise<Credentials> {
  const url = `${baseUrl.replace(/\/$/, '')}/oauth/token`
  const res = await axios.post<{
    access_token: string
    token_type: string
    expires_in?: number
    refresh_token?: string
    created_at?: number
  }>(url, {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  }, {
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    timeout: 30_000,
  })

  const data = res.data
  const expiresIn = data.expires_in ?? TOKEN_LIFETIME_MS / 1000
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + expiresIn * 1000),
    extra: { baseUrl, clientId, clientSecret },
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const baseUrl = credentials.extra?.['baseUrl'] as string | undefined
  const clientId = credentials.extra?.['clientId'] as string | undefined
  const clientSecret = credentials.extra?.['clientSecret'] as string | undefined
  const refreshToken = credentials.refreshToken

  if (!baseUrl) {
    throw new Error('Solidus refreshCredentials requires baseUrl in credentials.extra')
  }

  // If we have OAuth2 credentials, use refresh_token or client_credentials
  if (clientId && clientSecret) {
    const url = `${baseUrl.replace(/\/$/, '')}/oauth/token`
    const body: Record<string, string> = refreshToken
      ? {
          grant_type: 'refresh_token',
          refresh_token: refreshToken,
          client_id: clientId,
          client_secret: clientSecret,
        }
      : {
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
        }

    const res = await axios.post<{
      access_token: string
      token_type: string
      expires_in?: number
      refresh_token?: string
    }>(url, body, {
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      timeout: 30_000,
    })

    const data = res.data
    const expiresIn = data.expires_in ?? TOKEN_LIFETIME_MS / 1000
    return {
      ...credentials,
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? credentials.refreshToken,
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    }
  }

  // Static API key — nothing to refresh, just return as-is
  return credentials
}
