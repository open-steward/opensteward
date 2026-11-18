/**
 * ChannelAdvisor OAuth 2.0 authorization-code flow.
 *
 * Credentials required:
 *   applicationId  — Application ID from ChannelAdvisor Developer Console
 *   sharedSecret   — Shared Secret from Developer Console
 *
 * Token endpoint: https://api.channeladvisor.com/oauth2/token
 * Authorization uses Basic auth with base64(applicationId:sharedSecret).
 */
import axios from 'axios'
import type { Credentials, CredentialField } from '@opensteward/shared'
import { OAUTH_AUTHORIZE_URL, OAUTH_TOKEN_URL } from './constants'

export function credentialFields(): CredentialField[] {
  return [
    { name: 'applicationId', label: 'Application ID', type: 'text', required: true },
    { name: 'sharedSecret', label: 'Shared Secret', type: 'password', required: true },
  ]
}

/** Not used directly — ChannelAdvisor uses OAuth2 flow. */
export async function exchangeCredentials(_fields: Record<string, string>): Promise<Credentials> {
  throw new Error('channeladvisor uses OAuth2; call getAuthUrl() and exchangeCode() instead')
}

export function getAuthUrl(
  state: string,
  applicationId: string,
  scopes?: string[],
  redirectUri?: string,
): string {
  const params = new URLSearchParams({
    client_id: applicationId,
    response_type: 'code',
    access_type: 'offline',
    scope: (scopes ?? ['inventory', 'orders']).join(' '),
    state,
    ...(redirectUri ? { redirect_uri: redirectUri } : {}),
  })
  return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`
}

export async function exchangeCode(
  code: string,
  redirectUri: string,
  applicationId: string,
  sharedSecret: string,
): Promise<Credentials> {
  const basicAuth = Buffer.from(`${applicationId}:${sharedSecret}`).toString('base64')
  const { data } = await axios.post<{
    access_token: string
    refresh_token?: string
    expires_in?: number
    token_type?: string
  }>(
    OAUTH_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }).toString(),
    {
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    },
  )
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    extra: {
      applicationId,
      sharedSecret,
      expiresIn: data.expires_in,
      tokenType: data.token_type ?? 'Bearer',
    },
  }
}

export async function refreshAccessToken(credentials: Credentials): Promise<Credentials> {
  if (!credentials.refreshToken) return credentials
  const applicationId = String(credentials.extra?.['applicationId'] ?? '')
  const sharedSecret = String(credentials.extra?.['sharedSecret'] ?? '')
  if (!applicationId || !sharedSecret) return credentials

  const basicAuth = Buffer.from(`${applicationId}:${sharedSecret}`).toString('base64')
  const { data } = await axios.post<{
    access_token: string
    refresh_token?: string
    expires_in?: number
    token_type?: string
  }>(
    OAUTH_TOKEN_URL,
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: credentials.refreshToken,
    }).toString(),
    {
      headers: {
        Authorization: `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    },
  )
  return {
    ...credentials,
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? credentials.refreshToken,
    extra: {
      ...credentials.extra,
      expiresIn: data.expires_in,
      tokenType: data.token_type ?? 'Bearer',
    },
  }
}
