import type { Credentials } from '../../adapter/interface'
import { UBER_DIRECT_TOKEN_URL, UBER_DIRECT_DASHBOARD_URL, TOKEN_REFRESH_BUFFER_MS } from './constants'

export interface UberDirectAuthConfig {
  clientId: string
  clientSecret: string
  customerId?: string
}

export function buildAuthUrl(_state: string): string {
  return UBER_DIRECT_DASHBOARD_URL
}

export async function exchangeCredentials(config: UberDirectAuthConfig): Promise<Credentials> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    grant_type: 'client_credentials',
    scope: 'eats.deliveries direct.organizations',
  })

  const res = await fetch(UBER_DIRECT_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Uber Direct token exchange failed (${res.status}): ${text}`)
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
      customerId: config.customerId,
    },
  }
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  const clientId = extra.clientId as string | undefined
  const clientSecret = extra.clientSecret as string | undefined
  if (!clientId || !clientSecret) {
    throw new Error('Cannot refresh Uber Direct credentials: missing clientId/clientSecret in extra')
  }
  return exchangeCredentials({
    clientId,
    clientSecret,
    customerId: extra.customerId as string | undefined,
  })
}

export function isTokenExpired(credentials: Credentials): boolean {
  if (!credentials.expiresAt) return false
  return credentials.expiresAt.getTime() - Date.now() < TOKEN_REFRESH_BUFFER_MS
}
