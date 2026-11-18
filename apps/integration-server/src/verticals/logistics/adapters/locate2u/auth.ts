import type { Credentials } from '../../adapter/interface'
import {
  LOCATE2U_TOKEN_URL,
  LOCATE2U_SCOPE,
  LOCATE2U_DASHBOARD_URL,
  TOKEN_REFRESH_BUFFER_MS,
} from './constants'

export interface Locate2uAuthConfig {
  clientId: string
  clientSecret: string
}

/**
 * Locate2u uses OAuth2 client credentials flow.
 * Token endpoint: https://id.locate2u.com/connect/token
 * Tokens expire in 30 minutes.
 */

export function buildAuthUrl(_state: string): string {
  // Locate2u client credentials flow has no browser-redirect step.
  return LOCATE2U_DASHBOARD_URL
}

export async function exchangeCredentials(config: Locate2uAuthConfig): Promise<Credentials> {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scope: LOCATE2U_SCOPE,
  })

  const res = await fetch(LOCATE2U_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Locate2u token exchange failed (${res.status}): ${text}`)
  }

  const json = (await res.json()) as {
    access_token: string
    token_type: string
    expires_in: number
    scope?: string
  }

  return {
    accessToken: json.access_token,
    expiresAt: new Date(Date.now() + json.expires_in * 1000),
    scope: json.scope ?? LOCATE2U_SCOPE,
    extra: {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    },
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  const clientId = extra.clientId as string | undefined
  const clientSecret = extra.clientSecret as string | undefined

  if (!clientId || !clientSecret) {
    throw new Error('Cannot refresh Locate2u credentials: missing clientId/clientSecret in extra')
  }

  return exchangeCredentials({ clientId, clientSecret })
}

export function isTokenExpired(credentials: Credentials): boolean {
  if (!credentials.expiresAt) return false
  return credentials.expiresAt.getTime() - Date.now() < TOKEN_REFRESH_BUFFER_MS
}

export function authHeader(accessToken: string): string {
  return `Bearer ${accessToken}`
}
