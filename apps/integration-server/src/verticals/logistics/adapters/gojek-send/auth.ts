import type { Credentials } from '../../adapter/interface'
import { GOJEK_SEND_TOKEN_URL, GOJEK_SEND_DASHBOARD_URL, TOKEN_REFRESH_BUFFER_MS } from './constants'

export interface GojekSendAdapterAuthConfig {
  clientId: string
  clientSecret: string
  scope?: string
}

export function buildAuthUrl(_state: string): string {
  return GOJEK_SEND_DASHBOARD_URL
}

export async function exchangeCredentials(config: GojekSendAdapterAuthConfig): Promise<Credentials> {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: config.clientId,
    client_secret: config.clientSecret,
  })
  if (config.scope) body.set('scope', config.scope)

  const res = await fetch(GOJEK_SEND_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`GojekSendAdapter token exchange failed (${res.status}): ${text}`)
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

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  const clientId = extra.clientId as string | undefined
  const clientSecret = extra.clientSecret as string | undefined
  if (!clientId || !clientSecret) {
    throw new Error('Cannot refresh GojekSendAdapter credentials: missing clientId/clientSecret in extra')
  }
  return exchangeCredentials({ clientId, clientSecret, scope: credentials.scope })
}

export function isTokenExpired(credentials: Credentials): boolean {
  if (!credentials.expiresAt) return false
  return credentials.expiresAt.getTime() - Date.now() < TOKEN_REFRESH_BUFFER_MS
}

export function authHeader(accessToken: string): string {
  return `Bearer ${accessToken}`
}
