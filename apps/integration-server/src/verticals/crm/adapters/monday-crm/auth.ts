import type { Credentials } from '@opensteward/shared'
import { MONDAY_AUTH_URL, MONDAY_TOKEN_URL } from './constants'

export interface MondayOAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
}

interface MondayTokenResponse {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
}

export function buildAuthUrl(config: MondayOAuthConfig, state: string): string {
  const url = new URL(MONDAY_AUTH_URL)
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', config.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('state', state)
  return url.toString()
}

export async function exchangeCode(
  config: MondayOAuthConfig,
  code: string,
): Promise<Credentials> {
  const res = await fetch(MONDAY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      code,
    }).toString(),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Monday.com token exchange failed: ${text}`)
  }

  const json = await res.json() as MondayTokenResponse
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000)
      : undefined,
  }
}

export async function refreshToken(
  config: Pick<MondayOAuthConfig, 'clientId' | 'clientSecret'>,
  credentials: Credentials,
): Promise<Credentials> {
  if (!credentials.refreshToken) return credentials

  const res = await fetch(MONDAY_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: credentials.refreshToken,
    }).toString(),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`Monday.com token refresh failed: ${text}`)
  }

  const json = await res.json() as MondayTokenResponse
  return {
    ...credentials,
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? credentials.refreshToken,
    expiresAt: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000)
      : undefined,
  }
}
