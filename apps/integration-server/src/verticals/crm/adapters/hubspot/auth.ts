import type { Credentials } from '@opensteward/shared'
import {
  HUBSPOT_AUTH_URL,
  HUBSPOT_TOKEN_URL,
  DEFAULT_HUBSPOT_SCOPES,
} from './constants'

export interface HubSpotOAuthConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  /** OAuth scopes to request. Defaults to DEFAULT_HUBSPOT_SCOPES when omitted. */
  scopes?: string[]
}

export function buildAuthUrl(config: HubSpotOAuthConfig, state: string): string {
  const url = new URL(HUBSPOT_AUTH_URL)
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', config.redirectUri)
  url.searchParams.set('scope', (config.scopes ?? DEFAULT_HUBSPOT_SCOPES).join(' '))
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('state', state)
  return url.toString()
}

export async function exchangeCode(
  config: HubSpotOAuthConfig,
  code: string,
  redirectUri: string,
): Promise<Credentials> {
  const res = await fetch(HUBSPOT_TOKEN_URL, {
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
    throw new Error(`HubSpot token exchange failed: ${text}`)
  }

  const json = await res.json() as {
    access_token: string
    refresh_token?: string
    expires_in?: number
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000)
      : undefined,
  }
}

export async function refreshToken(
  config: Pick<HubSpotOAuthConfig, 'clientId' | 'clientSecret'>,
  credentials: Credentials,
): Promise<Credentials> {
  if (!credentials.refreshToken) return credentials

  const res = await fetch(HUBSPOT_TOKEN_URL, {
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
    throw new Error(`HubSpot token refresh failed: ${text}`)
  }

  const json = await res.json() as {
    access_token: string
    refresh_token?: string
    expires_in?: number
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token ?? credentials.refreshToken,
    expiresAt: json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000)
      : undefined,
  }
}
