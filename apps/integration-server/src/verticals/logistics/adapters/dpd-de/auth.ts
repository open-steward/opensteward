import type { Credentials } from '../../adapter/interface'
import { DPD_DE_API_BASE, DPD_DE_TOKEN_PATH, DPD_DE_DASHBOARD_URL, TOKEN_REFRESH_BUFFER_MS, TOKEN_TTL_MS } from './constants'

export function buildAuthUrl(_state: string): string {
  return DPD_DE_DASHBOARD_URL
}

export async function exchangeCredentials(clientId: string, clientSecret: string): Promise<Credentials> {
  const url = `${DPD_DE_API_BASE}${DPD_DE_TOKEN_PATH}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })
  if (!res.ok) throw new Error(`DPD-DE token exchange failed (${res.status})`)
  const json = await res.json()
  return {
    accessToken: json.access_token,
    expiresAt: new Date(Date.now() + (json.expires_in ? json.expires_in * 1000 : TOKEN_TTL_MS)),
    extra: { clientId, clientSecret },
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  return exchangeCredentials(extra.clientId as string, extra.clientSecret as string)
}

export function isTokenExpired(credentials: Credentials): boolean {
  if (!credentials.expiresAt) return false
  return credentials.expiresAt.getTime() - Date.now() < TOKEN_REFRESH_BUFFER_MS
}

export function authHeader(accessToken: string): string {
  return `Bearer ${accessToken}`
}
