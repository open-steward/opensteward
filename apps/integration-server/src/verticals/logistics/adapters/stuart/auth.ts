import type { Credentials } from '../../adapter/interface'
import { STUART_TOKEN_URL, STUART_DASHBOARD_URL, TOKEN_REFRESH_BUFFER_MS } from './constants'

export interface StuartAuthConfig {
  clientId: string
  clientSecret: string
}

export function buildAuthUrl(_state: string): string {
  return STUART_DASHBOARD_URL
}

export async function exchangeCredentials(config: StuartAuthConfig): Promise<Credentials> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: 'client_credentials',
    scope: 'api',
  })
  const res = await fetch(STUART_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Stuart token exchange failed (${res.status}): ${text}`)
  }
  const json = (await res.json()) as { access_token: string; expires_in: number; scope?: string }
  return {
    accessToken: json.access_token,
    expiresAt: new Date(Date.now() + json.expires_in * 1000),
    scope: json.scope,
    extra: { clientId: config.clientId, clientSecret: config.clientSecret },
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  const clientId = extra.clientId as string | undefined
  const clientSecret = extra.clientSecret as string | undefined
  if (!clientId || !clientSecret) {
    throw new Error('Cannot refresh Stuart credentials: missing clientId/clientSecret in extra')
  }
  return exchangeCredentials({ clientId, clientSecret })
}

export function isTokenExpired(credentials: Credentials): boolean {
  if (!credentials.expiresAt) return false
  return credentials.expiresAt.getTime() - Date.now() < TOKEN_REFRESH_BUFFER_MS
}
