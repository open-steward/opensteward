import type { Credentials } from '../../adapter/interface'
import { SHIPHERO_TOKEN_URL, SHIPHERO_DASHBOARD_URL, TOKEN_REFRESH_BUFFER_MS } from './constants'

export interface ShipheroAuthConfig {
  clientId: string
  clientSecret: string
  sandbox?: boolean
}

export function buildAuthUrl(_state: string): string {
  return SHIPHERO_DASHBOARD_URL
}

export async function exchangeCredentials(config: ShipheroAuthConfig): Promise<Credentials> {
  const res = await fetch(SHIPHERO_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: config.clientId,
      client_secret: config.clientSecret,
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`ShipHero token exchange failed (${res.status}): ${text}`)
  }

  const json = (await res.json()) as {
    access_token: string
    refresh_token?: string
    token_type: string
    expires_in: number
    scope?: string
  }

  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(Date.now() + json.expires_in * 1000),
    scope: json.scope,
    extra: {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      sandbox: config.sandbox,
    },
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  const clientId = extra.clientId as string | undefined
  const clientSecret = extra.clientSecret as string | undefined

  if (!clientId || !clientSecret) {
    throw new Error('Cannot refresh ShipHero credentials: missing clientId/clientSecret in extra')
  }

  return exchangeCredentials({
    clientId,
    clientSecret,
    sandbox: extra.sandbox as boolean | undefined,
  })
}

export function isTokenExpired(credentials: Credentials): boolean {
  if (!credentials.expiresAt) return false
  return credentials.expiresAt.getTime() - Date.now() < TOKEN_REFRESH_BUFFER_MS
}

export function authHeader(accessToken: string): string {
  return `Bearer ${accessToken}`
}
