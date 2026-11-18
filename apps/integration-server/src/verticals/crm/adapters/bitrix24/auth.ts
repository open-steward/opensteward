import type { Credentials } from '@opensteward/shared'
import { BITRIX24_OAUTH_AUTH_URL, BITRIX24_OAUTH_TOKEN_URL } from './constants'

export interface Bitrix24AuthConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
}

export function buildAuthUrl(config: Bitrix24AuthConfig, state: string): string {
  const url = new URL(BITRIX24_OAUTH_AUTH_URL)
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', config.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('state', state)
  return url.toString()
}

export async function exchangeCode(
  config: Bitrix24AuthConfig,
  code: string,
  redirectUri: string,
): Promise<Credentials> {
  const res = await fetch(BITRIX24_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectUri,
      code,
    }).toString(),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Bitrix24 token exchange failed: ${text}`)
  }

  const json = await res.json() as {
    access_token: string
    refresh_token?: string
    expires_in?: number
    client_endpoint?: string
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000)
      : undefined,
    extra: {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      // client_endpoint is the workspace base URL returned by Bitrix24
      baseUrl: json.client_endpoint,
    },
  }
}

export async function refreshCredentials(
  credentials: Credentials,
): Promise<Credentials> {
  if (!credentials.refreshToken) return credentials

  const clientId = credentials.extra?.['clientId'] as string | undefined
  const clientSecret = credentials.extra?.['clientSecret'] as string | undefined

  if (!clientId || !clientSecret) return credentials

  const res = await fetch(BITRIX24_OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: credentials.refreshToken,
    }).toString(),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Bitrix24 token refresh failed: ${text}`)
  }

  const json = await res.json() as {
    access_token: string
    refresh_token?: string
    expires_in?: number
    client_endpoint?: string
  }

  return {
    ...credentials,
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? credentials.refreshToken,
    expiresAt: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000)
      : undefined,
    extra: {
      ...credentials.extra,
      ...(json.client_endpoint ? { baseUrl: json.client_endpoint } : {}),
    },
  }
}
