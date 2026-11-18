import type { Credentials } from '../../adapter/interface'
import { EASYSHIP_TOKEN_URL, EASYSHIP_DASHBOARD_URL, TOKEN_REFRESH_BUFFER_MS } from './constants'

export interface EasyshipAuthConfig {
  clientId: string
  clientSecret: string
  scope?: string
}

export function buildAuthUrl(_state: string): string {
  return EASYSHIP_DASHBOARD_URL
}

export async function exchangeCredentials(config: EasyshipAuthConfig): Promise<Credentials> {
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: config.clientId,
    client_secret: config.clientSecret,
  })
  if (config.scope) body.set('scope', config.scope)

  const res = await fetch(EASYSHIP_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Easyship token exchange failed (${res.status}): ${text}`)
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

export async function exchangeApiKey(code: string): Promise<Credentials> {
  const [clientId, ...rest] = code.split(':')
  const clientSecret = rest.join(':')
  return exchangeCredentials({ clientId: clientId ?? '', clientSecret: clientSecret ?? '' })
}

export async function refreshCredentials(credentials: Credentials): Promise<Credentials> {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  const clientId = extra.clientId as string | undefined
  const clientSecret = extra.clientSecret as string | undefined
  if (!clientId || !clientSecret) return credentials
  return exchangeCredentials({ clientId, clientSecret })
}

export function isTokenExpired(credentials: Credentials): boolean {
  if (!credentials.expiresAt) return false
  return credentials.expiresAt.getTime() - Date.now() < TOKEN_REFRESH_BUFFER_MS
}

export function authHeader(accessToken: string): string {
  return `Bearer ${accessToken}`
}
