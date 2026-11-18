import type { Credentials } from '../../adapter/interface'
import { SHIPROCKET_API_BASE, SHIPROCKET_LOGIN_PATH, SHIPROCKET_DASHBOARD_URL, TOKEN_REFRESH_BUFFER_MS, TOKEN_TTL_MS } from './constants'

export function buildAuthUrl(_state: string): string {
  return SHIPROCKET_DASHBOARD_URL
}

export async function exchangeCredentials(email: string, password: string): Promise<Credentials> {
  const url = `${SHIPROCKET_API_BASE}${SHIPROCKET_LOGIN_PATH}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) throw new Error(`Shiprocket login failed (${res.status})`)
  const json = await res.json()
  return {
    accessToken: json.token,
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    extra: { email, password },
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  return exchangeCredentials(extra.email as string, extra.password as string)
}

export function isTokenExpired(credentials: Credentials): boolean {
  if (!credentials.expiresAt) return false
  return credentials.expiresAt.getTime() - Date.now() < TOKEN_REFRESH_BUFFER_MS
}

export function authHeader(accessToken: string): string {
  return `Bearer ${accessToken}`
}
