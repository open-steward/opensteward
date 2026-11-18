import type { Credentials } from '../../adapter/interface'
import { DPD_API_BASE, DPD_LOGIN_PATH, DPD_DASHBOARD_URL, TOKEN_REFRESH_BUFFER_MS, TOKEN_TTL_MS } from './constants'

export function buildAuthUrl(_state: string): string {
  return DPD_DASHBOARD_URL
}

export async function exchangeCredentials(userid: string, password: string): Promise<Credentials> {
  const url = `${DPD_API_BASE}${DPD_LOGIN_PATH}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userid, password }),
  })
  if (!res.ok) throw new Error(`DPD login failed (${res.status})`)
  const json = await res.json()
  return {
    accessToken: json.data?.authToken,
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    extra: { userid, password, geoSession: json.data?.geoSession },
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  return exchangeCredentials(extra.userid as string, extra.password as string)
}

export function isTokenExpired(credentials: Credentials): boolean {
  if (!credentials.expiresAt) return false
  return credentials.expiresAt.getTime() - Date.now() < TOKEN_REFRESH_BUFFER_MS
}

export function authHeader(accessToken: string): string {
  return `Bearer ${accessToken}`
}
