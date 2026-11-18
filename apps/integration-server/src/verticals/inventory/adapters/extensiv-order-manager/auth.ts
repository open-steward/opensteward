/**
 * Extensiv Order Manager OAuth2 helpers.
 *
 * Flow: authorization_code grant via app.skubana.com/oauth/token
 * Token endpoint auth: Basic base64(appKey:appSecret)
 * API calls: Bearer {access_token}
 */
import axios from 'axios'
import type { Credentials, CredentialField } from '@opensteward/shared'
import { AUTH_BASE_URL } from './constants'

export function credentialFields(): CredentialField[] {
  return [
    { name: 'appKey', label: 'App Key', type: 'text', required: true },
    { name: 'appSecret', label: 'App Secret', type: 'password', required: true },
    { name: 'redirectUri', label: 'Redirect URI', type: 'text', required: true },
  ]
}

export function getAuthUrl(appKey: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: appKey,
    redirect_uri: redirectUri,
    state,
  })
  return `${AUTH_BASE_URL}/oauth/authorize?${params.toString()}`
}

export async function exchangeCode(
  code: string,
  appKey: string,
  appSecret: string,
  redirectUri: string,
): Promise<Credentials> {
  const basicToken = Buffer.from(`${appKey}:${appSecret}`).toString('base64')
  const { data } = await axios.post<{ access_token: string; refresh_token?: string; expires_in?: number }>(
    `${AUTH_BASE_URL}/oauth/token`,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }).toString(),
    {
      headers: {
        Authorization: `Basic ${basicToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    },
  )
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    extra: { appKey, appSecret, redirectUri },
  }
}

export async function refreshToken(credentials: Credentials): Promise<Credentials> {
  if (!credentials.refreshToken) return credentials
  const appKey = String(credentials.extra?.['appKey'] ?? '')
  const appSecret = String(credentials.extra?.['appSecret'] ?? '')
  if (!appKey || !appSecret) return credentials
  const basicToken = Buffer.from(`${appKey}:${appSecret}`).toString('base64')
  const { data } = await axios.post<{ access_token: string; refresh_token?: string }>(
    `${AUTH_BASE_URL}/oauth/token`,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: credentials.refreshToken,
    }).toString(),
    {
      headers: {
        Authorization: `Basic ${basicToken}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    },
  )
  return {
    ...credentials,
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? credentials.refreshToken,
  }
}
