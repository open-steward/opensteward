import type { Credentials } from '../../adapter/interface'
import {
  TRIMBLE_TRUCKMATE_TOKEN_URL,
  TRIMBLE_TRUCKMATE_AUTH_SCOPE,
  TRIMBLE_TRUCKMATE_DASHBOARD_URL,
  TOKEN_REFRESH_BUFFER_MS,
} from './constants'

export interface TrimbleTruckmateAuthConfig {
  clientId: string
  clientSecret: string
}

/**
 * TruckMate uses Trimble Identity (TID) for OAuth2.
 * The connect flow redirects the user to the TruckMate developer portal
 * to generate API keys; we surface the portal URL as the "auth URL".
 */
export function buildAuthUrl(_state: string): string {
  return TRIMBLE_TRUCKMATE_DASHBOARD_URL
}

/**
 * Exchange client credentials for a Bearer token via Trimble Identity.
 * TruckMate supports the client_credentials grant type for server-to-server
 * integrations.
 */
export async function exchangeCredentials(config: TrimbleTruckmateAuthConfig): Promise<Credentials> {
  const url = TRIMBLE_TRUCKMATE_TOKEN_URL
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: config.clientId,
    client_secret: config.clientSecret,
    scope: TRIMBLE_TRUCKMATE_AUTH_SCOPE,
  })

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Trimble TruckMate token exchange failed (${res.status}): ${text}`)
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
    scope: json.scope,
    extra: {
      clientId: config.clientId,
      clientSecret: config.clientSecret,
    },
  }
}

/**
 * Re-acquire credentials using stored client credentials.
 * TruckMate does not issue refresh tokens in the client_credentials flow —
 * we simply re-run the token exchange.
 */
export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  const clientId = extra.clientId as string | undefined
  const clientSecret = extra.clientSecret as string | undefined

  if (!clientId || !clientSecret) {
    throw new Error(
      'Cannot refresh Trimble TruckMate credentials: missing clientId/clientSecret in extra',
    )
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
